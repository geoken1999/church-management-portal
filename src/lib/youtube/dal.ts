import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube/token";
import {
  fetchVideos,
  fetchChannelAnalytics,
  fetchCommentThreads,
  type YouTubeVideoPage,
  type YouTubeAnalyticsValue,
  type YouTubeCommentPage,
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
}

export type YouTubeDashboardData =
  | { connected: false }
  | {
      connected: true;
      channel: YouTubeConnectionSummary;
      videos: YouTubeVideoPage;
      analytics: YouTubeAnalyticsValue[];
      comments: YouTubeCommentPage;
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
  };

  try {
    const accessToken = await getValidAccessToken(connection);
    const [videos, analytics, comments] = await Promise.all([
      // The uploads playlist id is derived from the channel id
      // (UC... -> UU...) rather than re-fetching the channel every time.
      fetchVideos(accessToken, `UU${connection.channel_id.slice(2)}`),
      fetchChannelAnalytics(accessToken),
      fetchCommentThreads(accessToken, connection.channel_id),
    ]);
    return { connected: true, channel, videos, analytics, comments, syncError: false };
  } catch {
    return {
      connected: true,
      channel,
      videos: { items: [], nextCursor: null },
      analytics: [],
      comments: { items: [], nextCursor: null },
      syncError: true,
    };
  }
}
