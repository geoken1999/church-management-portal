import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPlanLimits, type PlanLimits } from "@/lib/plans/config";
import { formatBytes } from "@/lib/plans/format";

export interface PlanUsage {
  plan: PlanLimits;
  emailsSentThisMonth: number;
  emailsRemaining: number;
  smsSentThisMonth: number;
  smsRemaining: number;
  storageBytesUsed: number;
  storageBytesRemaining: number;
}

// cache()-wrapped so the several call sites in one request (dashboard
// usage card, email/sms availability checks, quota checks before
// send/upload) share one set of queries instead of re-fetching per call.
export const getPlanUsage = cache(async (organizationId: string): Promise<PlanUsage> => {
  const plan = getPlanLimits(organizationId);
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: emailCampaigns }, { data: smsCampaigns }, { data: storageBytes }] = await Promise.all([
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
    supabase.rpc("get_organization_storage_bytes", { target_org_id: organizationId }),
  ]);

  const emailsSentThisMonth = (emailCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const smsSentThisMonth = (smsCampaigns ?? []).reduce((sum, row) => sum + row.sent_count, 0);
  const storageBytesUsed = storageBytes ?? 0;

  return {
    plan,
    emailsSentThisMonth,
    emailsRemaining: Math.max(0, plan.emailsPerMonth - emailsSentThisMonth),
    smsSentThisMonth,
    smsRemaining: Math.max(0, plan.smsPerMonth - smsSentThisMonth),
    storageBytesUsed,
    storageBytesRemaining: Math.max(0, plan.storageBytes - storageBytesUsed),
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

// Called right before any upload to an org-scoped bucket
// (organization-logos, worship-documents, email-images).
export async function checkStorageQuota(organizationId: string, additionalBytes: number): Promise<string | null> {
  const usage = await getPlanUsage(organizationId);
  if (additionalBytes > usage.storageBytesRemaining) {
    return `This would exceed your ${usage.plan.name} plan's ${formatBytes(usage.plan.storageBytes)} storage limit (${formatBytes(usage.storageBytesRemaining)} remaining). Upgrade your plan or free up space.`;
  }
  return null;
}
