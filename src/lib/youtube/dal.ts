import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube/token";
import {
  fetchVideos,
  fetchChannelAnalytics,
  fetchCommentThreads,
  fetchLiveBroadcasts,
  fetchTopVideos,
  type YouTubeVideoPage,
  type YouTubeAnalyticsValue,
  type YouTubeCommentPage,
  type YouTubeBroadcast,
  type YouTubeTopVideo,
} from "@/lib/youtube/client";

// Returns the full row, including access_token/refresh_token — this file
// is server-only and every caller must be careful never to forward those
// fields into a Client Component prop.
export const getYouTubeConnection = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("youtube_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

export interface YouTubeConnectionSummary {
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  connectedAt: string;
}

export type YouTubeDashboardData =
  | { connected: false }
  | {
      connected: true;
      channel: YouTubeConnectionSummary;
      videos: YouTubeVideoPage;
      analytics: YouTubeAnalyticsValue[];
      comments: YouTubeCommentPage;
      liveBroadcasts: { live: YouTubeBroadcast[]; upcoming: YouTubeBroadcast[] };
      topVideos: YouTubeTopVideo[];
      syncError: boolean;
    };

// Not cache()-wrapped — performs live external calls and can write a
// refreshed token as a side effect, so it should run at most once per
// request.
export async function getYouTubeDashboardData(organizationId: string): Promise<YouTubeDashboardData> {
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { connected: false };

  const channel: YouTubeConnectionSummary = {
    channelId: connection.channel_id,
    channelTitle: connection.channel_title,
    thumbnailUrl: connection.thumbnail_url,
    subscriberCount: connection.subscriber_count,
    videoCount: connection.video_count,
    viewCount: connection.view_count,
    connectedAt: connection.created_at,
  };

  try {
    const accessToken = await getValidAccessToken(connection);
    const [videos, analytics, comments, liveBroadcasts, topVideos] = await Promise.all([
      // The uploads playlist id is derived from the channel id
      // (UC... -> UU...) rather than re-fetching the channel every time.
      fetchVideos(accessToken, `UU${connection.channel_id.slice(2)}`),
      fetchChannelAnalytics(accessToken),
      fetchCommentThreads(accessToken, connection.channel_id),
      fetchLiveBroadcasts(accessToken),
      fetchTopVideos(accessToken),
    ]);
    return { connected: true, channel, videos, analytics, comments, liveBroadcasts, topVideos, syncError: false };
  } catch {
    return {
      connected: true,
      channel,
      videos: { items: [], nextCursor: null },
      analytics: [],
      comments: { items: [], nextCursor: null },
      liveBroadcasts: { live: [], upcoming: [] },
      topVideos: [],
      syncError: true,
    };
  }
}
