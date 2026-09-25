import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, isPlanId, type PlanLimits } from "@/lib/plans/config";
import { formatBytes } from "@/lib/plans/format";

// "trial": within the 3-day window after signup, no subscription needed
// yet — full Basic-tier access. "active": a Razorpay subscription is
// actually charging. "expired": trial ran out and there's no active
// subscription — the dashboard layout blocks everything except Billing
// (see src/app/dashboard/layout.tsx) until they subscribe.
export type PlanAccessStatus = "trial" | "active" | "expired";

export interface PlanAccess {
  plan: PlanLimits;
  accessStatus: PlanAccessStatus;
  trialEndsAt: string | null;
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
    supabase.from("organizations").select("plan, trial_ends_at").eq("id", organizationId).maybeSingle(),
    admin.from("organization_subscriptions").select("status").eq("organization_id", organizationId).maybeSingle(),
  ]);

  if (subscription?.status === "active") {
    const planId = org?.plan;
    return {
      plan: PLANS[planId && isPlanId(planId) ? planId : "basic"],
      accessStatus: "active",
      trialEndsAt: org?.trial_ends_at ?? null,
    };
  }

  const trialEndsAt = org?.trial_ends_at ?? null;
  const stillTrialing = trialEndsAt ? new Date(trialEndsAt) > new Date() : false;

  return {
    plan: PLANS.basic,
    accessStatus: stillTrialing ? "trial" : "expired",
    trialEndsAt,
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
}

// cache()-wrapped so the several call sites in one request (dashboard
// usage card, email/sms availability checks, quota checks before
// send/upload) share one set of queries instead of re-fetching per call.
export const getPlanUsage = cache(async (organizationId: string): Promise<PlanUsage> => {
  const { plan, accessStatus, trialEndsAt } = await getPlanAccess(organizationId);
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
    emailsRemaining: Math.max(0, plan.emailsPerMonth - emailsSentThisMonth),
    smsSentThisMonth,
    smsRemaining: Math.max(0, plan.smsPerMonth - smsSentThisMonth),
    whatsappSentThisMonth,
    whatsappRemaining: Math.max(0, plan.whatsappPerMonth - whatsappSentThisMonth),
    storageBytesUsed,
    storageBytesRemaining: Math.max(0, plan.storageBytes - storageBytesUsed),
    additionalTeamMembers,
    additionalTeamMembersRemaining: Math.max(0, plan.maxAdditionalTeamMembers - additionalTeamMembers),
  };
});

// Called right before a shared-provider send — an org's own SMTP bypasses
// this check entirely (see sendBulkEmailAction).
export async function checkEmailQuota(organizationId: string, recipientCount: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (recipientCount > usage.emailsRemaining) {
    return `Sending to ${recipientCount} recipients would exceed your ${usage.plan.name} plan's ${usage.plan.emailsPerMonth.toLocaleString()}/month email limit (${usage.emailsRemaining.toLocaleString()} remaining). Upgrade your plan to send more.`;
  }
  return null;
}

// Called right before every SMS send — there's no per-org SMTP-style
// bypass for SMS, so this always applies.
export async function checkSmsQuota(organizationId: string, recipientCount: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (recipientCount > usage.smsRemaining) {
    return `Sending to ${recipientCount} recipients would exceed your ${usage.plan.name} plan's ${usage.plan.smsPerMonth.toLocaleString()}/month SMS limit (${usage.smsRemaining.toLocaleString()} remaining). Upgrade your plan to send more.`;
  }
  return null;
}

// Called right before a 'shared'-mode WhatsApp send — an org's own
// connected Twilio account bypasses this entirely (see
// sendBulkWhatsAppAction), same as SMTP does for email.
export async function checkWhatsAppQuota(organizationId: string, recipientCount: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (recipientCount > usage.whatsappRemaining) {
    return `Sending to ${recipientCount} recipients would exceed your ${usage.plan.name} plan's ${usage.plan.whatsappPerMonth.toLocaleString()}/month WhatsApp limit (${usage.whatsappRemaining.toLocaleString()} remaining) on the shared number. Connect your own WhatsApp number, or upgrade your plan.`;
  }
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
    return `This would exceed your ${usage.plan.name} plan's ${formatBytes(usage.plan.storageBytes)} storage limit (${formatBytes(usage.storageBytesRemaining)} remaining). Upgrade your plan or free up space.`;
  }
  return null;
}
