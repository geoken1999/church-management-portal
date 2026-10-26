import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { externalLiveActive, parseExternalLink, PLATFORM_NAMES } from "@/lib/livestream/external-link";
import type { ExternalLiveStream } from "@/types/database";

/** The church's YouTube or Facebook live link that members should see right now, or null. */
export async function getActiveExternalLive(organizationId: string): Promise<ExternalLiveStream | null> {
  const { data } = await createAdminClient()
    .from("external_live_streams")
    .select("*")
    .eq("organization_id", organizationId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as ExternalLiveStream | null;
  return row && externalLiveActive(row) ? row : null;
}

/** What the member app needs: never more than the link, its platform and, for YouTube, the video to play inside the app. */
export function publicExternalLive(row: ExternalLiveStream) {
  const parsed = parseExternalLink(row.url);
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    platformName: PLATFORM_NAMES[row.platform],
    url: row.url,
    youtubeVideoId: "error" in parsed ? null : parsed.youtubeVideoId,
    startedAt: row.started_at,
  };
}
