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

// Returns the full row for the ACTIVE channel, including access_token/
// refresh_token — this file is server-only and every caller must be
// careful never to forward those fields into a Client Component prop. An
// org can have several connected channels (see getYouTubeConnections); all
// the video/comment/broadcast actions operate on whichever one is active.
export const getYouTubeConnection = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("youtube_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  return data;
});

export interface YouTubeChannelOption {
  id: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  isActive: boolean;
}

// Public-safe summary of every channel connected to this org, for the
// channel switcher — deliberately excludes access_token/refresh_token,
// unlike getYouTubeConnection, since this shape is passed down into a
// Client Component.
export const getYouTubeConnections = cache(async (organizationId: string): Promise<YouTubeChannelOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("youtube_connections")
    .select("id, channel_id, channel_title, thumbnail_url, is_active")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    thumbnailUrl: row.thumbnail_url,
    isActive: row.is_active,
  }));
});

export interface YouTubeConnectionSummary {
  id: string;
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
    id: connection.id,
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
  } catch (err) {
    console.error("[youtube] dashboard sync failed:", err);
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
