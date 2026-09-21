import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSmsConfigured } from "@/lib/sms/env";
import { getPlanUsage } from "@/lib/plans/dal";

export const getSmsCampaigns = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sms_campaigns")
    .select("*, profiles(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
});

// Unlike email (SMTP bypasses the quota), SMS has no per-org unmetered
// path — available only while the provider is configured AND this
// month's quota isn't exhausted.
export async function isSmsAvailable(organizationId: string): Promise<boolean> {
  if (!isSmsConfigured()) return false;
  const usage = await getPlanUsage(organizationId);
  return usage.smsRemaining > 0;
}
