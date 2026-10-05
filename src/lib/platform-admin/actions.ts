"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import {
  isPlanId,
  PLANS,
  CAPPABLE_TABS,
  FINANCE_TABS,
  SOCIAL_TABS,
  effectiveTabs,
  type CustomPlanOverrides,
  type CappableTab,
} from "@/lib/plans/config";
import { TAB_KEYS, type TabKey } from "@/lib/permissions/tabs";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { notifyOrgOfSupportReply } from "@/lib/support/notify-org";
import { sendEventPayoutProcessedEmail } from "@/lib/billing/receipts";
import { TAB_LABELS } from "@/lib/permissions/tabs";
import type { SupportTicketStatus } from "@/types/database";

const PAYOUTS_PATH = "/platform-admin/payouts";
const TENANTS_PATH = "/platform-admin/tenants";
const SUPPORT_PATH = "/platform-admin/support";
const SESSIONS_PATH = "/platform-admin/sessions";
const FEATURE_FLAGS_PATH = "/platform-admin/feature-flags";

const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export interface RecordPayoutState {
  error?: string;
  success?: boolean;
}

// Purely a bookkeeping entry — recording a payout here does not itself
// move any money. It's how a platform operator marks that they've
// already wired funds to the church externally for a 'shared'-mode
// fundraiser.
export async function recordFundraiserPayout(_prevState: RecordPayoutState, formData: FormData): Promise<RecordPayoutState> {
  const user = await requirePlatformAdmin();

  const fundraiserId = String(formData.get("fundraiserId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const amount = Number(amountRaw);
  if (!amountRaw.trim() || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter an amount greater than 0." };
  }

  const admin = createAdminClient();
  const { data: payout, error } = await admin
    .from("fundraiser_payouts")
    .insert({
      organization_id: organizationId,
      fundraiser_id: fundraiserId,
      amount,
      note: note || null,
      paid_by: user.id,
    })
    .select("id")
    .single();

  if (error || !payout) {
    return { error: "Couldn't record that payout. Please try again." };
  }

  // Resolves whichever pending request this payout was for, if any — a
  // payout can also be recorded ad hoc with no request behind it, which
  // is left alone here.
  await admin
    .from("fundraiser_payout_requests")
    .update({ status: "paid", resolved_payout_id: payout.id })
    .eq("fundraiser_id", fundraiserId)
    .eq("status", "pending");

  revalidatePath(PAYOUTS_PATH);
  return { success: true };
}

// Mirrors recordFundraiserPayout exactly, for platform-gateway events.
export async function recordEventPayout(_prevState: RecordPayoutState, formData: FormData): Promise<RecordPayoutState> {
  const user = await requirePlatformAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const amount = Number(amountRaw);
  if (!amountRaw.trim() || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter an amount greater than 0." };
  }

  const admin = createAdminClient();
  const { data: payout, error } = await admin
    .from("event_payouts")
    .insert({
      organization_id: organizationId,
      event_id: eventId,
      amount,
      note: note || null,
      paid_by: user.id,
    })
    .select("id")
    .single();

  if (error || !payout) {
    return { error: "Couldn't record that payout. Please try again." };
  }

  await admin
    .from("event_payout_requests")
    .update({ status: "paid", resolved_payout_id: payout.id })
    .eq("event_id", eventId)
    .eq("status", "pending");

  const { data: event } = await admin.from("events").select("title").eq("id", eventId).maybeSingle();
  await sendEventPayoutProcessedEmail(organizationId, event?.title ?? "your event", amount);

  revalidatePath(PAYOUTS_PATH);
  return { success: true };
}

export interface SetTenantPlanState {
  error?: string;
  success?: boolean;
}

// Grants a plan for free ("comping" it) — upserts an organization_subscriptions
// row with status 'active' and no razorpay_subscription_id, same shape
// getPlanAccess already reads to decide effective access, so the org
// immediately gets that plan's limits without ever going through Razorpay.
export async function setTenantPlan(_prevState: SetTenantPlanState, formData: FormData): Promise<SetTenantPlanState> {
  const platformAdmin = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  if (!isPlanId(planId)) {
    return { error: "Select a valid plan." };
  }

  const admin = createAdminClient();
  const { error: subError } = await admin
    .from("organization_subscriptions")
    .upsert({ organization_id: organizationId, plan_id: planId, status: "active" }, { onConflict: "organization_id" });

  if (subError) {
    return { error: "Couldn't update that tenant's plan. Please try again." };
  }

  await admin.from("organizations").update({ plan: planId }).eq("id", organizationId);

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) set tenant plan to ${planId}`,
    organizationId,
    metadata: { planId },
  });

  revalidatePath(TENANTS_PATH);
  return { success: true };
}

export interface SetTenantCustomPlanLimitsState {
  error?: string;
  success?: boolean;
}

// Empty string means "unlimited" (null) for the nullable-number rule
// fields (kmeetMaxDurationMinutes, branchLimit, memberLimit, formsLimit,
// automationLimit) — the dialog always submits a complete object, so a
// blank field is a deliberate "no cap" choice, not a missing one.
function readNullableInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readInt(formData: FormData, key: string, fallback = 0): number {
  const parsed = Number(formData.get(key) ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Overrides individual plan "rules" for one org — fulfillment for the
// landing page's Custom tier, which is otherwise entirely manual. Price
// stays whatever the org is comped to via setTenantPlan above; only the
// rule fields (quotas, caps, feature flags, SLA) are overridden here. See
// resolvePlanLimits (src/lib/plans/config.ts) for how this gets merged
// back in everywhere the app reads an org's effective plan.
export async function setTenantCustomPlanLimits(
  _prevState: SetTenantCustomPlanLimitsState,
  formData: FormData,
): Promise<SetTenantCustomPlanLimitsState> {
  const platformAdmin = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  // storageGb is the form's human-friendly unit — converted to bytes,
  // the unit every other quota check in this app already expects
  // (checkStorageQuota, formatBytes, etc.).
  const storageGb = Number(formData.get("storageGb") ?? "0");

  const overrides: CustomPlanOverrides = {
    emailsPerMonth: readInt(formData, "emailsPerMonth"),
    smsPerMonth: readInt(formData, "smsPerMonth"),
    whatsappPerMonth: readInt(formData, "whatsappPerMonth"),
    aiRepliesPerMonth: readInt(formData, "aiRepliesPerMonth"),
    instagramAccountLimit: readInt(formData, "instagramAccountLimit"),
    youtubeAccountLimit: readInt(formData, "youtubeAccountLimit"),
    storageBytes: Number.isFinite(storageGb) ? Math.round(storageGb * 1024 * 1024 * 1024) : 0,
    kmeetMaxDurationMinutes: readNullableInt(formData, "kmeetMaxDurationMinutes"),
    maxAdditionalAdmins: readInt(formData, "maxAdditionalAdmins"),
    maxAdditionalStaff: readInt(formData, "maxAdditionalStaff"),
    branchLimit: readNullableInt(formData, "branchLimit"),
    memberLimit: readNullableInt(formData, "memberLimit"),
    formsLimit: readNullableInt(formData, "formsLimit"),
    financeEnabled: formData.get("financeEnabled") === "on",
    ownPaymentGatewayEnabled: formData.get("ownPaymentGatewayEnabled") === "on",
    socialMediaEnabled: formData.get("socialMediaEnabled") === "on",
    customSmtpEnabled: formData.get("customSmtpEnabled") === "on",
    automationLimit: readNullableInt(formData, "automationLimit"),
    supportSlaDays: readInt(formData, "supportSlaDays", 5),
  };

  // Tab switches: "default" leaves the key out (plan default flows through),
  // "on"/"off" are stored as overrides. Finance and Social are one switch
  // each, applied to every tab in their group.
  const tabOverrides: Partial<Record<TabKey, boolean>> = {};
  const parseSwitch = (value: string | null): boolean | undefined =>
    value === "on" ? true : value === "off" ? false : undefined;
  const financeSwitch = parseSwitch(formData.get("group_finance") as string | null);
  const socialSwitch = parseSwitch(formData.get("group_social") as string | null);
  for (const tab of FINANCE_TABS) if (financeSwitch !== undefined) tabOverrides[tab] = financeSwitch;
  for (const tab of SOCIAL_TABS) if (socialSwitch !== undefined) tabOverrides[tab] = socialSwitch;
  for (const tab of TAB_KEYS) {
    if (FINANCE_TABS.includes(tab) || SOCIAL_TABS.includes(tab)) continue;
    const value = parseSwitch(formData.get(`tab_${tab}`) as string | null);
    if (value !== undefined) tabOverrides[tab] = value;
  }

  const featureCaps: Partial<Record<CappableTab, number | null>> = {};
  for (const tab of CAPPABLE_TABS) {
    featureCaps[tab] = readNullableInt(formData, `cap_${tab}`);
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("plan").eq("id", organizationId).maybeSingle();
  const basePlanId = org?.plan && isPlanId(org.plan) ? org.plan : "basic";

  // Module flags are derived from the tab switches, so the stored flags can
  // never disagree with what the nav and page checks see.
  const tabs = effectiveTabs(PLANS[basePlanId], tabOverrides);
  const finalOverrides: CustomPlanOverrides = {
    ...overrides,
    financeEnabled: tabs.fundraisers,
    socialMediaEnabled: tabs.instagram,
    tabOverrides,
    featureCaps,
  };

  const { error } = await admin
    .from("organizations")
    .update({ custom_plan_limits: finalOverrides as unknown as Record<string, unknown> })
    .eq("id", organizationId);

  if (error) {
    return { error: "Couldn't save those custom rules. Please try again." };
  }

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) set custom plan rules`,
    organizationId,
    metadata: { overrides: finalOverrides },
  });

  revalidatePath(TENANTS_PATH);
  revalidatePath(`${TENANTS_PATH}/${organizationId}`);
  return { success: true };
}

// Reverts an org back to its plain named plan (Starter/Growth/Pro) —
// whatever custom rules were set are discarded, not preserved for reuse.
export async function clearTenantCustomPlanLimits(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const admin = createAdminClient();
  await admin.from("organizations").update({ custom_plan_limits: null }).eq("id", organizationId);

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) reverted custom plan rules to the standard plan`,
    organizationId,
  });

  revalidatePath(TENANTS_PATH);
  revalidatePath(`${TENANTS_PATH}/${organizationId}`);
}

export interface ExtendTenantTrialState {
  error?: string;
  success?: boolean;
}

export async function extendTenantTrial(_prevState: ExtendTenantTrialState, formData: FormData): Promise<ExtendTenantTrialState> {
  const platformAdmin = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const daysRaw = String(formData.get("days") ?? "");
  const days = Number(daysRaw);

  if (!daysRaw.trim() || Number.isNaN(days) || days <= 0) {
    return { error: "Enter a number of days greater than 0." };
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("trial_ends_at").eq("id", organizationId).maybeSingle();
  if (!org) {
    return { error: "That tenant could not be found." };
  }

  // Extends from whichever is later — "now" or the existing trial_ends_at
  // — so this always adds `days` of runway rather than shrinking a trial
  // that already runs further out than today.
  const base = org.trial_ends_at && new Date(org.trial_ends_at) > new Date() ? new Date(org.trial_ends_at) : new Date();
  const newTrialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const { error } = await admin.from("organizations").update({ trial_ends_at: newTrialEndsAt.toISOString() }).eq("id", organizationId);
  if (error) {
    return { error: "Couldn't extend that trial. Please try again." };
  }

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) extended trial by ${days} days`,
    organizationId,
    metadata: { days, newTrialEndsAt: newTrialEndsAt.toISOString() },
  });

  revalidatePath(TENANTS_PATH);
  return { success: true };
}

export async function updateSupportTicketStatus(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!SUPPORT_TICKET_STATUSES.includes(status as SupportTicketStatus)) return;

  const admin = createAdminClient();
  await admin.from("support_tickets").update({ status: status as SupportTicketStatus }).eq("id", ticketId);

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) set support ticket status to ${status}`,
    metadata: { ticketId, status },
  });

  revalidatePath(SUPPORT_PATH);
}

export interface AddPlatformSupportReplyState {
  error?: string;
  success?: boolean;
}

// Platform admin's reply — written via the service-role client (bypasses
// RLS, so author_type: 'admin' is safe to set directly, unlike the org
// side's own addSupportTicketMessage which RLS restricts to author_type:
// 'org'). Also notifies the org so its members see the reply without
// having to keep checking back.
export async function addPlatformSupportReply(
  _prevState: AddPlatformSupportReplyState,
  formData: FormData,
): Promise<AddPlatformSupportReplyState> {
  const platformAdmin = await requirePlatformAdmin();
  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Write a reply before sending." };
  }

  const admin = createAdminClient();
  const { data: ticket } = await admin.from("support_tickets").select("organization_id, subject").eq("id", ticketId).maybeSingle();
  if (!ticket) {
    return { error: "That ticket could not be found." };
  }

  const { error } = await admin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    organization_id: ticket.organization_id,
    author_type: "admin",
    body,
  });

  if (error) {
    return { error: "Couldn't send that reply. Please try again." };
  }

  await admin.from("notifications").insert({
    organization_id: ticket.organization_id,
    type: "support_ticket_reply",
    title: "Support replied to your ticket",
    body: `Re: ${ticket.subject}`,
    link: "/dashboard/support",
  });

  await notifyOrgOfSupportReply({ organizationId: ticket.organization_id, ticketSubject: ticket.subject, replyBody: body });

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) replied to a support ticket`,
    organizationId: ticket.organization_id,
    metadata: { ticketId },
  });

  revalidatePath(SUPPORT_PATH);
  return { success: true };
}

// Force-signs-out one specific session (see migration 0083) — the killed
// user's very next request fails re-authentication, since proxy.ts
// revalidates via supabase.auth.getUser() (not the weaker getSession()) on
// every request rather than trusting a locally-decoded, unexpired JWT.
export async function revokeSession(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  const userEmail = String(formData.get("userEmail") ?? "unknown");
  if (!sessionId) return;

  const admin = createAdminClient();
  await admin.rpc("admin_revoke_session", { target_session_id: sessionId });

  await logPlatformEvent({
    level: "warning",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) revoked a session for ${userEmail}`,
    metadata: { sessionId, userEmail },
  });

  revalidatePath(SESSIONS_PATH);
}

// Turns a tab off (or back on) for every tenant at once — see
// getDisabledFeatures/getUserOrganizations/checkTabAccess for the two
// places this is actually enforced. revalidatePath("/dashboard", "layout")
// busts every dashboard page's cache in one call so the change is visible
// immediately, not just after this admin page's own next load.
export async function setFeatureFlag(tabKey: TabKey, enabled: boolean): Promise<void> {
  const platformAdmin = await requirePlatformAdmin();

  const admin = createAdminClient();
  await admin
    .from("platform_feature_flags")
    .upsert({ tab_key: tabKey, enabled, updated_by: platformAdmin.id, updated_at: new Date().toISOString() }, { onConflict: "tab_key" });

  await logPlatformEvent({
    level: "warning",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) ${enabled ? "re-enabled" : "disabled"} "${TAB_LABELS[tabKey]}" platform-wide`,
    metadata: { tabKey, enabled },
  });

  revalidatePath(FEATURE_FLAGS_PATH);
  revalidatePath("/dashboard", "layout");
}
