import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LiveStreamAccess } from "@/types/database";

// Whether a church may use live streaming, and whether it has asked.
export const getLiveStreamAccess = cache(async (organizationId: string): Promise<{ enabled: boolean; requestedAt: string | null; note: string | null; enabledAt: string | null }> => {
  const { data } = await createAdminClient().from("live_stream_access").select("*").eq("organization_id", organizationId).maybeSingle();
  const row = data as LiveStreamAccess | null;
  return { enabled: row?.enabled ?? false, requestedAt: row?.requested_at ?? null, note: row?.note ?? null, enabledAt: row?.enabled_at ?? null };
});

export async function isLiveStreamEnabled(organizationId: string): Promise<boolean> {
  return (await getLiveStreamAccess(organizationId)).enabled;
}

export const LIVE_STREAM_NOT_ENABLED = "Live streaming isn't turned on for your church yet. Use \"Contact us to enable\" on the Live stream page.";
