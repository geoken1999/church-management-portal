import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, isPlanId, type PlanLimits } from "@/lib/plans/config";
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
      .select("plan, trial_ends_at, addon_sms_credits, addon_email_credits, addon_whatsapp_credits, addon_storage_bytes")
      .eq("id", organizationId)
      .maybeSingle(),
    admin.from("organization_subscriptions").select("status").eq("organization_id", organizationId).maybeSingle(),
  ]);

  const addonBalances = {
    addonSmsCredits: org?.addon_sms_credits ?? 0,
    addonEmailCredits: org?.addon_email_credits ?? 0,
    addonWhatsappCredits: org?.addon_whatsapp_credits ?? 0,
    addonStorageBytes: org?.addon_storage_bytes ?? 0,
  };

  if (subscription?.status === "active") {
    const planId = org?.plan;
    return {
      plan: PLANS[planId && isPlanId(planId) ? planId : "basic"],
      accessStatus: "active",
      trialEndsAt: org?.trial_ends_at ?? null,
      ...addonBalances,
    };
  }

  const trialEndsAt = org?.trial_ends_at ?? null;
  const stillTrialing = trialEndsAt ? new Date(trialEndsAt) > new Date() : false;

  return {
    plan: PLANS.basic,
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
  storageBytesUsed: number;
  storageBytesRemaining: number;
  additionalTeamMembers: number;
  additionalTeamMembersRemaining: number;
  // Add-on pack balances included in the *Remaining totals above — broken
  // out separately too since the Billing page displays them on their own.
  addonSmsCredits: number;
  addonEmailCredits: number;
  addonWhatsappCredits: number;
  addonStorageBytes: number;
}

// cache()-wrapped so the several call sites in one request (dashboard
// usage card, email/sms availability checks, quota checks before
// send/upload) share one set of queries instead of re-fetching per call.
export const getPlanUsage = cache(async (organizationId: string): Promise<PlanUsage> => {
  const { plan, accessStatus, trialEndsAt, addonSmsCredits, addonEmailCredits, addonWhatsappCredits, addonStorageBytes } =
    await getPlanAccess(organizationId);
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: emailCampaigns }, { data: smsCampaigns }, { data: whatsappCampaigns }, { data: storageBytes }, { count: teamMemberCount }] =
    await Promise.all([
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
      supabase.rpc("get_organization_storage_bytes", { target_org_id: organizationId }),
      // The owner's own seat doesn't count against the added-members limit.
      supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .neq("role", "owner"),
    ]);

  const emailsSentThisMonth = (emailCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const smsSentThisMonth = (smsCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const whatsappSentThisMonth = (whatsappCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const storageBytesUsed = storageBytes ?? 0;
  const additionalTeamMembers = teamMemberCount ?? 0;

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
    storageBytesUsed,
    storageBytesRemaining: Math.max(0, plan.storageBytes + addonStorageBytes - storageBytesUsed),
    additionalTeamMembers,
    additionalTeamMembersRemaining: Math.max(0, plan.maxAdditionalTeamMembers - additionalTeamMembers),
    addonSmsCredits,
    addonEmailCredits,
    addonWhatsappCredits,
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

// Called right before a new login is issued (see createMemberLogin).
export async function checkTeamMemberQuota(organizationId: string): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (usage.additionalTeamMembersRemaining <= 0) {
    return `Your ${usage.plan.name} plan allows up to ${usage.plan.maxAdditionalTeamMembers} added team members. Remove someone or upgrade your plan to add more.`;
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
