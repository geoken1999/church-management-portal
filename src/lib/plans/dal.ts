import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPlanId,
  resolvePlanLimits,
  resolveTabStates,
  type PlanLimits,
  type CustomPlanOverrides,
  type CappableTab,
} from "@/lib/plans/config";
import type { TabKey } from "@/lib/permissions/tabs";
import { formatBytes } from "@/lib/plans/format";
import { logPlatformEvent } from "@/lib/platform-events/log";

// "trial": within the 14-day window after signup, no subscription needed
// yet — full Basic-tier access. "active": a Razorpay subscription is
// actually charging. "expired": trial ran out and there's no active
// subscription — the dashboard layout blocks everything except Billing
// (see src/app/dashboard/layout.tsx) until they subscribe.
export type PlanAccessStatus = "trial" | "active" | "expired";

export interface PlanAccess {
  plan: PlanLimits;
  accessStatus: PlanAccessStatus;
  trialEndsAt: string | null;
  // Add-on pack balances (see plans/config.ts ADDON_PACKS) — a running
  // total that never auto-resets monthly, unlike the plan's own quotas.
  addonSmsCredits: number;
  addonEmailCredits: number;
  addonWhatsappCredits: number;
  addonStorageBytes: number;
  // Not sold as an ADDON_PACKS pack (no purchase flow yet) — same shape as
  // the others regardless, so it composes into *Remaining the same way and
  // a platform admin can manually top it up later without a schema change.
  addonAiCredits: number;
}

// organizations.plan is the source of truth for which tier a *subscribed*
// org is on — set by the Razorpay webhook when a subscription activates
// (see src/app/api/razorpay/webhook). Before that (or after a
// subscription lapses), trial_ends_at decides whether the org still gets
// Basic-tier access for free or has to subscribe.
export const getPlanAccess = cache(async (organizationId: string): Promise<PlanAccess> => {
  const supabase = await createClient();
  // organization_subscriptions' RLS only allows admins to read it (see
  // migration 0043) — deliberately, so plain members can't see billing
  // details via the API. But *whether* the org has an active subscription
  // is an access-control fact every member's session needs, not just
  // admins', so this specific read goes through the admin client to
  // bypass that restriction rather than relaxing the policy itself.
  const admin = createAdminClient();
  const [{ data: org }, { data: subscription }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "plan, trial_ends_at, addon_sms_credits, addon_email_credits, addon_whatsapp_credits, addon_storage_bytes, addon_ai_credits, custom_plan_limits",
      )
      .eq("id", organizationId)
      .maybeSingle(),
    admin.from("organization_subscriptions").select("status").eq("organization_id", organizationId).maybeSingle(),
  ]);

  const addonBalances = {
    addonSmsCredits: org?.addon_sms_credits ?? 0,
    addonEmailCredits: org?.addon_email_credits ?? 0,
    addonWhatsappCredits: org?.addon_whatsapp_credits ?? 0,
    addonStorageBytes: org?.addon_storage_bytes ?? 0,
    addonAiCredits: org?.addon_ai_credits ?? 0,
  };

  // Applied regardless of subscription status below — a platform
  // admin's custom override for a negotiated deal isn't tied to whether
  // Razorpay happens to think the subscription is active.
  const customOverrides = (org?.custom_plan_limits ?? null) as CustomPlanOverrides | null;

  if (subscription?.status === "active") {
    const planId = org?.plan;
    return {
      plan: resolvePlanLimits(planId && isPlanId(planId) ? planId : "basic", customOverrides),
      accessStatus: "active",
      trialEndsAt: org?.trial_ends_at ?? null,
      ...addonBalances,
    };
  }

  const trialEndsAt = org?.trial_ends_at ?? null;
  const stillTrialing = trialEndsAt ? new Date(trialEndsAt) > new Date() : false;

  return {
    plan: resolvePlanLimits("basic", customOverrides),
    accessStatus: stillTrialing ? "trial" : "expired",
    trialEndsAt,
    ...addonBalances,
  };
});

// Kept as a thin wrapper — most call sites only ever need the plan
// limits, not the trial/subscription status alongside them.
export async function getPlanLimits(organizationId: string): Promise<PlanLimits> {
  return (await getPlanAccess(organizationId)).plan;
}

export interface PlanUsage {
  plan: PlanLimits;
  accessStatus: PlanAccessStatus;
  trialEndsAt: string | null;
  // Only meaningful while accessStatus is "trial" — null otherwise.
  // Computed here (rather than inline where it's displayed) since that's
  // a component render body, and Date.now() there would make the render
  // impure.
  trialDaysRemaining: number | null;
  emailsSentThisMonth: number;
  emailsRemaining: number;
  smsSentThisMonth: number;
  smsRemaining: number;
  whatsappSentThisMonth: number;
  whatsappRemaining: number;
  aiRepliesSentThisMonth: number;
  aiRepliesRemaining: number;
  storageBytesUsed: number;
  storageBytesRemaining: number;
  additionalAdmins: number;
  additionalAdminsRemaining: number;
  additionalStaff: number;
  additionalStaffRemaining: number;
  // Add-on pack balances included in the *Remaining totals above — broken
  // out separately too since the Billing page displays them on their own.
  addonSmsCredits: number;
  addonEmailCredits: number;
  addonWhatsappCredits: number;
  addonStorageBytes: number;
  addonAiCredits: number;
}

// cache()-wrapped so the several call sites in one request (dashboard
// usage card, email/sms availability checks, quota checks before
// send/upload) share one set of queries instead of re-fetching per call.
export const getPlanUsage = cache(async (organizationId: string): Promise<PlanUsage> => {
  const {
    plan,
    accessStatus,
    trialEndsAt,
    addonSmsCredits,
    addonEmailCredits,
    addonWhatsappCredits,
    addonStorageBytes,
    addonAiCredits,
  } = await getPlanAccess(organizationId);
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    { data: emailCampaigns },
    { data: smsCampaigns },
    { data: whatsappCampaigns },
    { count: aiRepliesCount },
    { data: storageBytes },
    { count: adminCount },
    { count: staffCount },
  ] = await Promise.all([
    // Only 'shared' sends count against the quota — an org's own SMTP
    // (provider: 'smtp') doesn't touch our Resend account at all.
    supabase
      .from("email_campaigns")
      .select("sent_count")
      .eq("organization_id", organizationId)
      .eq("provider", "shared")
      .gte("created_at", startOfMonth.toISOString()),
    // SMS has no per-org "bring your own Twilio" option, so every
    // campaign counts against the quota.
    supabase
      .from("sms_campaigns")
      .select("sent_count")
      .eq("organization_id", organizationId)
      .gte("created_at", startOfMonth.toISOString()),
    // Same shared-vs-own split as email: only 'shared'-mode WhatsApp
    // sends touch our Twilio account; 'own' mode is the org's own bill.
    supabase
      .from("whatsapp_campaigns")
      .select("sent_count")
      .eq("organization_id", organizationId)
      .eq("mode", "shared")
      .gte("created_at", startOfMonth.toISOString()),
    // One row per AI reply actually sent (see ai_reply_usage) — a straight
    // count, unlike the sent_count sums above, since there's no campaign
    // batching concept for individual DM replies.
    supabase
      .from("ai_reply_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfMonth.toISOString()),
    supabase.rpc("get_organization_storage_bytes", { target_org_id: organizationId }),
    // The owner's own seat doesn't count against either added-members
    // limit — split by role so an exhausted admin cap can't be worked
    // around by adding more staff instead (see checkTeamMemberQuota).
    supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "admin"),
    supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "member"),
  ]);

  const emailsSentThisMonth = (emailCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const smsSentThisMonth = (smsCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const whatsappSentThisMonth = (whatsappCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const aiRepliesSentThisMonth = aiRepliesCount ?? 0;
  const storageBytesUsed = storageBytes ?? 0;
  const additionalAdmins = adminCount ?? 0;
  const additionalStaff = staffCount ?? 0;

  const trialDaysRemaining =
    accessStatus === "trial" && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  return {
    plan,
    accessStatus,
    trialEndsAt,
    trialDaysRemaining,
    emailsSentThisMonth,
    emailsRemaining: Math.max(0, plan.emailsPerMonth - emailsSentThisMonth) + addonEmailCredits,
    smsSentThisMonth,
    smsRemaining: Math.max(0, plan.smsPerMonth - smsSentThisMonth) + addonSmsCredits,
    whatsappSentThisMonth,
    whatsappRemaining: Math.max(0, plan.whatsappPerMonth - whatsappSentThisMonth) + addonWhatsappCredits,
    aiRepliesSentThisMonth,
    aiRepliesRemaining: Math.max(0, plan.aiRepliesPerMonth - aiRepliesSentThisMonth) + addonAiCredits,
    storageBytesUsed,
    storageBytesRemaining: Math.max(0, plan.storageBytes + addonStorageBytes - storageBytesUsed),
    additionalAdmins,
    additionalAdminsRemaining: Math.max(0, plan.maxAdditionalAdmins - additionalAdmins),
    additionalStaff,
    additionalStaffRemaining: Math.max(0, plan.maxAdditionalStaff - additionalStaff),
    addonSmsCredits,
    addonEmailCredits,
    addonWhatsappCredits,
    addonAiCredits,
    addonStorageBytes,
  };
});

// Add-on credits are a persistent balance (they don't reset monthly like
// the plan quota does), so once a send dips into them they need to
// actually be drawn down — otherwise the same purchased balance would
// silently "renew" every month on top of the plan quota forever. Called
// only from the three checkXQuota functions below, each of which is
// itself called exactly once, immediately before its module's actual send
// — so folding the decrement in here (rather than a separate call the
// caller would have to remember) can't double-consume. Like the rest of
// this app's quota bookkeeping (e.g. team member counts), this is a soft
// read-then-write with no transactional lock around it.
async function consumeAddonOverage(
  organizationId: string,
  column: "addon_sms_credits" | "addon_email_credits" | "addon_whatsapp_credits",
  currentBalance: number,
  overage: number,
): Promise<void> {
  if (overage <= 0) return;
  const nextBalance = Math.max(0, currentBalance - overage);
  const admin = createAdminClient();
  const update =
    column === "addon_sms_credits"
      ? { addon_sms_credits: nextBalance }
      : column === "addon_email_credits"
        ? { addon_email_credits: nextBalance }
        : { addon_whatsapp_credits: nextBalance };
  await admin.from("organizations").update(update).eq("id", organizationId);
}

// Called right before a shared-provider send — an org's own SMTP bypasses
// this check entirely (see sendBulkEmailAction).
export async function checkEmailQuota(organizationId: string, recipientCount: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (recipientCount > usage.emailsRemaining) {
    await logPlatformEvent({
      level: "info",
      source: "quota",
      message: `Email quota exceeded on ${usage.plan.name} plan`,
      organizationId,
      metadata: { recipientCount, remaining: usage.emailsRemaining, planLimit: usage.plan.emailsPerMonth },
    });
    return `Sending to ${recipientCount} recipients would exceed your ${usage.plan.name} plan's ${usage.plan.emailsPerMonth.toLocaleString()}/month email limit plus your ${usage.addonEmailCredits.toLocaleString()} add-on credits (${usage.emailsRemaining.toLocaleString()} remaining). Buy an email add-on pack or upgrade your plan to send more.`;
  }
  const planOnlyRemaining = Math.max(0, usage.plan.emailsPerMonth - usage.emailsSentThisMonth);
  await consumeAddonOverage(organizationId, "addon_email_credits", usage.addonEmailCredits, recipientCount - planOnlyRemaining);
  return null;
}

// Called right before every SMS send — there's no per-org SMTP-style
// bypass for SMS, so this always applies.
export async function checkSmsQuota(organizationId: string, recipientCount: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (recipientCount > usage.smsRemaining) {
    await logPlatformEvent({
      level: "info",
      source: "quota",
      message: `SMS quota exceeded on ${usage.plan.name} plan`,
      organizationId,
      metadata: { recipientCount, remaining: usage.smsRemaining, planLimit: usage.plan.smsPerMonth },
    });
    return `Sending to ${recipientCount} recipients would exceed your ${usage.plan.name} plan's ${usage.plan.smsPerMonth.toLocaleString()}/month SMS limit plus your ${usage.addonSmsCredits.toLocaleString()} add-on credits (${usage.smsRemaining.toLocaleString()} remaining). Buy an SMS add-on pack or upgrade your plan to send more.`;
  }
  const planOnlyRemaining = Math.max(0, usage.plan.smsPerMonth - usage.smsSentThisMonth);
  await consumeAddonOverage(organizationId, "addon_sms_credits", usage.addonSmsCredits, recipientCount - planOnlyRemaining);
  return null;
}

// Called right before a 'shared'-mode WhatsApp send — an org's own
// connected Twilio account bypasses this entirely (see
// sendBulkWhatsAppAction), same as SMTP does for email.
export async function checkWhatsAppQuota(organizationId: string, recipientCount: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (recipientCount > usage.whatsappRemaining) {
    await logPlatformEvent({
      level: "info",
      source: "quota",
      message: `WhatsApp quota exceeded on ${usage.plan.name} plan`,
      organizationId,
      metadata: { recipientCount, remaining: usage.whatsappRemaining, planLimit: usage.plan.whatsappPerMonth },
    });
    return `Sending to ${recipientCount} recipients would exceed your ${usage.plan.name} plan's ${usage.plan.whatsappPerMonth.toLocaleString()}/month WhatsApp limit plus your ${usage.addonWhatsappCredits.toLocaleString()} add-on credits (${usage.whatsappRemaining.toLocaleString()} remaining) on the shared number. Buy a WhatsApp add-on pack, connect your own WhatsApp number, or upgrade your plan.`;
  }
  const planOnlyRemaining = Math.max(0, usage.plan.whatsappPerMonth - usage.whatsappSentThisMonth);
  await consumeAddonOverage(organizationId, "addon_whatsapp_credits", usage.addonWhatsappCredits, recipientCount - planOnlyRemaining);
  return null;
}

// Called right before a new login is issued (see createMemberLogin) — the
// role being added decides which independent cap applies. An org can't
// cover an exhausted admin seat by adding more staff instead, or vice
// versa.
export async function checkTeamMemberQuota(organizationId: string, role: "admin" | "member"): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (role === "admin") {
    if (usage.additionalAdminsRemaining <= 0) {
      return `Your ${usage.plan.name} plan allows up to ${usage.plan.maxAdditionalAdmins} added admin${usage.plan.maxAdditionalAdmins === 1 ? "" : "s"}. Remove someone or upgrade your plan to add more.`;
    }
    return null;
  }
  if (usage.additionalStaffRemaining <= 0) {
    return `Your ${usage.plan.name} plan allows up to ${usage.plan.maxAdditionalStaff} added staff member${usage.plan.maxAdditionalStaff === 1 ? "" : "s"}. Remove someone or upgrade your plan to add more.`;
  }
  return null;
}

// Called right before any upload to an org-scoped bucket
// (organization-logos, worship-documents, email-images).
export async function checkStorageQuota(organizationId: string, additionalBytes: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (additionalBytes > usage.storageBytesRemaining) {
    const limitLabel = usage.addonStorageBytes > 0 ? formatBytes(usage.plan.storageBytes + usage.addonStorageBytes) : formatBytes(usage.plan.storageBytes);
    await logPlatformEvent({
      level: "info",
      source: "quota",
      message: `Storage quota exceeded on ${usage.plan.name} plan`,
      organizationId,
      metadata: { additionalBytes, remaining: usage.storageBytesRemaining },
    });
    return `This would exceed your ${usage.plan.name} plan's ${limitLabel} storage limit (${formatBytes(usage.storageBytesRemaining)} remaining). Buy a storage add-on pack, upgrade your plan, or free up space.`;
  }
  return null;
}

// Called right before adding a branch/congregation member/form — same
// shape as checkStorageQuota, just a plain row count against a plan
// field instead of a derived usage number. null on the plan field means
// unlimited, so these always pass for Premium/Pro.
export async function checkBranchQuota(organizationId: string): Promise<string | null> {
  const { plan } = await getPlanUsage(organizationId);
  if (plan.branchLimit === null) return null;
  const supabase = await createClient();
  const { count } = await supabase.from("branches").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if ((count ?? 0) >= plan.branchLimit) {
    return `Your ${plan.name} plan allows up to ${plan.branchLimit} branches. Remove one or upgrade your plan to add more.`;
  }
  return null;
}

export async function checkMemberQuota(organizationId: string): Promise<string | null> {
  const { plan } = await getPlanUsage(organizationId);
  if (plan.memberLimit === null) return null;
  const supabase = await createClient();
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if ((count ?? 0) >= plan.memberLimit) {
    return `Your ${plan.name} plan allows up to ${plan.memberLimit.toLocaleString()} members. Upgrade your plan to add more.`;
  }
  return null;
}

export async function checkFormsQuota(organizationId: string): Promise<string | null> {
  const { plan } = await getPlanUsage(organizationId);
  if (plan.formsLimit === null) return null;
  const supabase = await createClient();
  const { count } = await supabase.from("forms").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if ((count ?? 0) >= plan.formsLimit) {
    return `Your ${plan.name} plan allows up to ${plan.formsLimit} forms. Remove one or upgrade your plan to add more.`;
  }
  return null;
}

// Only active automations count against the plan's "at a time" limit. Drafts
// and paused automations are free to keep. Enforced at activation, atomically,
// by the activate_automation_within_limit database function (migration 0110).
export async function checkAutomationQuota(organizationId: string): Promise<string | null> {
  const { plan } = await getPlanUsage(organizationId);
  if (plan.automationLimit === null) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("automations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if ((count ?? 0) >= plan.automationLimit) {
    return `Your ${plan.name} plan allows up to ${plan.automationLimit} active automations at a time (${count ?? 0} active now). Pause one or upgrade your plan to activate more.`;
  }
  return null;
}

// Called before generating an Ask Aura response — unlike the Instagram
// webhook's *ForWebhook variants below, this runs inside a normal
// authenticated Server Action, so it can reuse getPlanUsage's
// session-scoped, request-cached read instead of re-querying via the admin
// client.
export async function checkAiCreditQuota(organizationId: string): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (usage.aiRepliesRemaining <= 0) {
    await logPlatformEvent({
      level: "info",
      source: "quota",
      message: `AI credit quota exceeded on ${usage.plan.name} plan`,
      organizationId,
      metadata: { planLimit: usage.plan.aiRepliesPerMonth, addonAiCredits: usage.addonAiCredits },
    });
    return `You've used all ${usage.plan.aiRepliesPerMonth.toLocaleString()} AI credits included in your ${usage.plan.name} plan this month, plus your ${usage.addonAiCredits.toLocaleString()} add-on credits. Buy an AI credit add-on pack or upgrade your plan to keep going.`;
  }
  return null;
}

// Call only after a reply was actually generated and shown to the user —
// shared by Instagram DM auto-replies and Ask Aura, tagged by `source` so
// the two remain distinguishable for observability even though they draw
// from the same pool. Writes go through the admin client rather than the
// session client: ai_reply_usage has no authenticated insert policy (see
// migration 0091) and the addon_ai_credits decrement on organizations hits
// the same admin-only write path consumeAddonOverage above already uses —
// the caller's own checkAiCreditQuota call just above is what stands in for
// row-level authorization here.
export async function recordAiReplyUsage(
  organizationId: string,
  source: "instagram" | "ask_aura",
  participantId: string | null = null,
): Promise<void> {
  const usage = await getPlanUsage(organizationId);
  const planOnlyRemaining = Math.max(0, usage.plan.aiRepliesPerMonth - usage.aiRepliesSentThisMonth);
  const admin = createAdminClient();
  if (planOnlyRemaining <= 0 && usage.addonAiCredits > 0) {
    await admin
      .from("organizations")
      .update({ addon_ai_credits: Math.max(0, usage.addonAiCredits - 1) })
      .eq("id", organizationId);
  }
  await admin.from("ai_reply_usage").insert({ organization_id: organizationId, participant_id: participantId, source });
}

// --- Webhook-side AI credit check below: the Instagram webhook that
// generates and sends AI replies carries no user session, so it can't use
// getPlanUsage/getPlanAccess above (both go through the request-scoped,
// RLS-governed client) — this re-reads the same organizations/
// organization_subscriptions/ai_reply_usage data directly via the admin
// client instead, mirroring getPlanAccess's own active-subscription logic
// rather than composing it. ---

async function resolveEffectivePlanForWebhook(organizationId: string): Promise<PlanLimits> {
  const admin = createAdminClient();
  const [{ data: org }, { data: subscription }] = await Promise.all([
    admin.from("organizations").select("plan, custom_plan_limits").eq("id", organizationId).maybeSingle(),
    admin.from("organization_subscriptions").select("status").eq("organization_id", organizationId).maybeSingle(),
  ]);
  const customOverrides = (org?.custom_plan_limits ?? null) as CustomPlanOverrides | null;
  if (subscription?.status !== "active") return resolvePlanLimits("basic", customOverrides);
  return resolvePlanLimits(org?.plan && isPlanId(org.plan) ? org.plan : "basic", customOverrides);
}

function startOfCurrentMonthIso(): string {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

// Read-only — call before generating a reply, to avoid spending an OpenAI
// call on a reply that can't be sent anyway once credits are exhausted.
export async function hasAiCreditAvailableForWebhook(organizationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [plan, { data: org }, { count: usedThisMonth }] = await Promise.all([
    resolveEffectivePlanForWebhook(organizationId),
    admin.from("organizations").select("addon_ai_credits").eq("id", organizationId).maybeSingle(),
    admin
      .from("ai_reply_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfCurrentMonthIso()),
  ]);

  const remaining = Math.max(0, plan.aiRepliesPerMonth - (usedThisMonth ?? 0)) + (org?.addon_ai_credits ?? 0);
  if (remaining <= 0) {
    await logPlatformEvent({
      level: "info",
      source: "quota",
      message: `AI credit quota exceeded on ${plan.name} plan`,
      organizationId,
      metadata: { planLimit: plan.aiRepliesPerMonth, addonAiCredits: org?.addon_ai_credits ?? 0 },
    });
  }
  return remaining > 0;
}

// Call only after the reply has actually been sent successfully — a failed
// generation or send shouldn't cost a credit. Re-reads current state
// rather than reusing hasAiCreditAvailableForWebhook's numbers (same soft
// read-then-write tradeoff as consumeAddonOverage above); the two calls are
// seconds apart around one OpenAI + one Graph API call, not a hot loop, so
// the tiny race window this leaves is the same kind already accepted
// throughout this file.
export async function recordAiReplyUsageForWebhook(
  organizationId: string,
  participantId: string,
  source: "instagram" | "whatsapp" = "instagram",
): Promise<void> {
  const admin = createAdminClient();
  const [plan, { data: org }, { count: usedThisMonth }] = await Promise.all([
    resolveEffectivePlanForWebhook(organizationId),
    admin.from("organizations").select("addon_ai_credits").eq("id", organizationId).maybeSingle(),
    admin
      .from("ai_reply_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfCurrentMonthIso()),
  ]);

  const planOnlyRemaining = Math.max(0, plan.aiRepliesPerMonth - (usedThisMonth ?? 0));
  if (planOnlyRemaining <= 0 && (org?.addon_ai_credits ?? 0) > 0) {
    await admin
      .from("organizations")
      .update({ addon_ai_credits: Math.max(0, (org?.addon_ai_credits ?? 0) - 1) })
      .eq("id", organizationId);
  }

  await admin.from("ai_reply_usage").insert({ organization_id: organizationId, participant_id: participantId, source });
}

// Per-tab on/off state and feature caps for one org — read by checkTabAccess
// (every server action) and the nav. Cached per request like getPlanAccess.
export const getOrgFeatureState = cache(
  async (organizationId: string): Promise<{ tabs: Record<TabKey, boolean>; featureCaps: Partial<Record<CappableTab, number | null>> }> => {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("plan, custom_plan_limits")
      .eq("id", organizationId)
      .maybeSingle();
    const planId = org?.plan && isPlanId(org.plan) ? org.plan : "basic";
    const custom = (org?.custom_plan_limits ?? null) as CustomPlanOverrides | null;
    return {
      tabs: resolveTabStates(planId, custom),
      featureCaps: custom?.featureCaps ?? {},
    };
  },
);

// Blocks a create action once a tenant's cap for that feature is reached.
export async function checkFeatureCap(organizationId: string, tab: CappableTab, table: string): Promise<string | null> {
  const { featureCaps } = await getOrgFeatureState(organizationId);
  const cap = featureCaps[tab] ?? null;
  if (cap === null) return null;
  const supabase = await createClient();
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if ((count ?? 0) >= cap) {
    return `This church's plan allows up to ${cap} ${tab} entries. Remove one or contact us to raise the limit.`;
  }
  return null;
}
