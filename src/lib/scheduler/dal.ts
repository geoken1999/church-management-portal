import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ScheduledCampaign, ScheduledCampaignChannel } from "@/types/database";

// What is waiting to go out on a channel, and how the latest ones went.
export const getScheduledCampaigns = cache(async (organizationId: string, channel: ScheduledCampaignChannel): Promise<ScheduledCampaign[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scheduled_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: false })
    .limit(15);
  return (data ?? []) as ScheduledCampaign[];
});
