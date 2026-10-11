import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { REPUTATION_WINDOW_DAYS, limitRate, shouldPauseMarketing, statsFromLog, type SenderStats } from "@/lib/whatsapp/reputation-rules";

export async function getMarketingStats(organizationId: string, days = REPUTATION_WINDOW_DAYS): Promise<SenderStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("whatsapp_message_log")
    .select("status, error_code, category")
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .limit(5000);
  return statsFromLog(data ?? []);
}

// For a church sending marketing from the shared number: null if it may, or
// a message saying why not. A platform admin can lift it for a church.
export async function checkMarketingAllowed(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("whatsapp_marketing_override").eq("id", organizationId).maybeSingle();
  if (org?.whatsapp_marketing_override) return null;

  const stats = await getMarketingStats(organizationId);
  if (!shouldPauseMarketing(stats)) return null;
  return `WhatsApp refused ${Math.round(limitRate(stats) * 100)}% of your marketing messages in the last ${REPUTATION_WINDOW_DAYS} days (${stats.limited} of ${stats.resolved}). Because these are sent from the shared KingdomFlow number, marketing messages are paused for now so they don't affect other churches. Send by SMS or email instead, connect your own WhatsApp number, or contact support.`;
}
