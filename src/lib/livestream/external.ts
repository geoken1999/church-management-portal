import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { externalLiveActive, parseExternalLink, PLATFORM_NAMES } from "@/lib/livestream/external-link";
import { youtubeLiveState } from "@/lib/livestream/youtube-status";
import type { ExternalLiveStream } from "@/types/database";

// How often YouTube is asked whether a stream is still live, however many phones are looking.
const RECHECK_SECONDS = 45;

// Asks YouTube whether the announced stream has finished, and ends the card if so. Needs YOUTUBE_API_KEY (a Google Cloud
// API key for the YouTube Data API v3); without one, or for a link that names no single video (a channel's live address,
// Facebook), the card stays until the church ends it or 12 hours pass. Never throws: a failed check leaves the card up.
async function endIfYoutubeFinished(row: ExternalLiveStream): Promise<boolean> {
  const key = process.env.YOUTUBE_API_KEY;
  const parsed = parseExternalLink(row.url);
  if (!key || "error" in parsed || parsed.platform !== "youtube" || !parsed.youtubeVideoId) return false;
  try {
    const admin = createAdminClient();
    // Only one request in each window does the asking.
    const staleBefore = new Date(Date.now() - RECHECK_SECONDS * 1000).toISOString();
    const { data: claimed } = await admin
      .from("external_live_streams")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", row.id)
      .or(`last_checked_at.is.null,last_checked_at.lt.${staleBefore}`)
      .select("id")
      .maybeSingle();
    if (!claimed) return false;
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${parsed.youtubeVideoId}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    if (youtubeLiveState(await response.json()) !== "ended") return false;
    await admin.from("external_live_streams").update({ ended_at: new Date().toISOString() }).eq("id", row.id).is("ended_at", null);
    return true;
  } catch {
    return false;
  }
}

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
  if (!row || !externalLiveActive(row)) return null;
  return (await endIfYoutubeFinished(row)) ? null : row;
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
