import "server-only";

import { getYouTubeEnv } from "@/lib/youtube/env";

const DATA_API_BASE = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API_BASE = "https://youtubeanalytics.googleapis.com/v2";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// youtube.force-ssl (not just youtube.readonly) is required to post comment
// replies — read-only scopes can't write, even to reply to a comment.
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
].join(" ");

async function readGoogleError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    if (typeof body.error === "string") return body.error;
    return body.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = getYouTubeEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  // Forces Google to reissue a refresh_token even if this org connected
  // before — without it, reconnecting after a token was lost/revoked would
  // silently succeed but leave us with no refresh_token to persist.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", YOUTUBE_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResult> {
  const { clientId, clientSecret } = getYouTubeEnv();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`YouTube token exchange failed: ${await readGoogleError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, expiresInSeconds: data.expires_in };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  const { clientId, clientSecret } = getYouTubeEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`YouTube token refresh failed: ${await readGoogleError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Google doesn't reissue the refresh_token on a plain refresh — the
  // caller keeps using the one it already has.
  return { accessToken: data.access_token, refreshToken: null, expiresInSeconds: data.expires_in };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  uploadsPlaylistId: string;
}

interface RawChannel {
  id: string;
  snippet: { title: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
}

export async function fetchChannel(accessToken: string): Promise<YouTubeChannel> {
  const url = new URL(`${DATA_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("mine", "true");

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch the YouTube channel: ${await readGoogleError(res)}`);
  }

  const data = (await res.json()) as { items: RawChannel[] };
  const channel = data.items[0];
  if (!channel) {
    throw new Error("No YouTube channel found for this Google account.");
  }

  return {
    id: channel.id,
    title: channel.snippet.title,
    thumbnailUrl: channel.snippet.thumbnails?.default?.url ?? null,
    subscriberCount: channel.statistics?.subscriberCount ? Number(channel.statistics.subscriberCount) : null,
    videoCount: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : null,
    viewCount: channel.statistics?.viewCount ? Number(channel.statistics.viewCount) : null,
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
  };
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface YouTubeVideoPage {
  items: YouTubeVideo[];
  nextCursor: string | null;
}

interface RawPlaylistItem {
  contentDetails: { videoId: string };
  snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url?: string } } };
}

interface RawVideoStats {
  id: string;
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export async function fetchVideos(
  accessToken: string,
  uploadsPlaylistId: string,
  pageToken?: string | null,
): Promise<YouTubeVideoPage> {
  const listUrl = new URL(`${DATA_API_BASE}/playlistItems`);
  listUrl.searchParams.set("part", "snippet,contentDetails");
  listUrl.searchParams.set("playlistId", uploadsPlaylistId);
  listUrl.searchParams.set("maxResults", "12");
  if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

  const listRes = await fetch(listUrl.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!listRes.ok) {
    throw new Error(`Couldn't fetch YouTube videos: ${await readGoogleError(listRes)}`);
  }

  const listData = (await listRes.json()) as { items: RawPlaylistItem[]; nextPageToken?: string };
  const videoIds = listData.items.map((item) => item.contentDetails.videoId);

  const statsById = new Map<string, RawVideoStats["statistics"]>();
  if (videoIds.length > 0) {
    const statsUrl = new URL(`${DATA_API_BASE}/videos`);
    statsUrl.searchParams.set("part", "statistics");
    statsUrl.searchParams.set("id", videoIds.join(","));

    const statsRes = await fetch(statsUrl.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
    if (statsRes.ok) {
      const statsData = (await statsRes.json()) as { items: RawVideoStats[] };
      for (const item of statsData.items) {
        statsById.set(item.id, item.statistics);
      }
    }
  }

  const items: YouTubeVideo[] = listData.items.map((item) => {
    const stats = statsById.get(item.contentDetails.videoId);
    return {
      id: item.contentDetails.videoId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? null,
      publishedAt: item.snippet.publishedAt,
      viewCount: stats?.viewCount ? Number(stats.viewCount) : 0,
      likeCount: stats?.likeCount ? Number(stats.likeCount) : 0,
      commentCount: stats?.commentCount ? Number(stats.commentCount) : 0,
    };
  });

  return { items, nextCursor: listData.nextPageToken ?? null };
}

export interface YouTubeAnalyticsValue {
  name: string;
  value: number;
}

// Metric names/availability drift and a rejected metric 400s the whole
// request — same "fail soft" reasoning as Instagram's account insights.
const CHANNEL_ANALYTICS_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
];

export async function fetchChannelAnalytics(accessToken: string): Promise<YouTubeAnalyticsValue[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  const toDateString = (d: Date) => d.toISOString().slice(0, 10);

  const url = new URL(`${ANALYTICS_API_BASE}/reports`);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", toDateString(start));
  url.searchParams.set("endDate", toDateString(end));
  url.searchParams.set("metrics", CHANNEL_ANALYTICS_METRICS.join(","));

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { columnHeaders?: { name: string }[]; rows?: number[][] };
  const headers = data.columnHeaders ?? [];
  const row = data.rows?.[0] ?? [];

  return headers.map((header, index) => ({ name: header.name, value: row[index] ?? 0 }));
}

export interface YouTubeComment {
  id: string;
  videoId: string;
  authorName: string;
  authorProfileImageUrl: string | null;
  text: string;
  publishedAt: string;
  likeCount: number;
  canReply: boolean;
}

export interface YouTubeCommentPage {
  items: YouTubeComment[];
  nextCursor: string | null;
}

interface RawCommentThread {
  id: string;
  snippet: {
    canReply: boolean;
    topLevelComment: {
      snippet: {
        videoId: string;
        authorDisplayName: string;
        authorProfileImageUrl?: string;
        textDisplay: string;
        publishedAt: string;
        likeCount: number;
      };
    };
  };
}

export async function fetchCommentThreads(
  accessToken: string,
  channelId: string,
  pageToken?: string | null,
): Promise<YouTubeCommentPage> {
  const url = new URL(`${DATA_API_BASE}/commentThreads`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("allThreadsRelatedToChannelId", channelId);
  url.searchParams.set("order", "time");
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("textFormat", "plainText");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch YouTube comments: ${await readGoogleError(res)}`);
  }

  const data = (await res.json()) as { items: RawCommentThread[]; nextPageToken?: string };
  const items: YouTubeComment[] = data.items.map((thread) => {
    const top = thread.snippet.topLevelComment.snippet;
    return {
      id: thread.id,
      videoId: top.videoId,
      authorName: top.authorDisplayName,
      authorProfileImageUrl: top.authorProfileImageUrl ?? null,
      text: top.textDisplay,
      publishedAt: top.publishedAt,
      likeCount: top.likeCount,
      canReply: thread.snippet.canReply,
    };
  });

  return { items, nextCursor: data.nextPageToken ?? null };
}

// Replies attach to the top-level comment thread's id (not a video id) —
// callers pass the YouTubeComment.id from fetchCommentThreads.
export async function replyToComment(accessToken: string, parentCommentId: string, text: string): Promise<void> {
  const url = new URL(`${DATA_API_BASE}/comments`);
  url.searchParams.set("part", "snippet");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { parentId: parentCommentId, textOriginal: text } }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't post that reply: ${await readGoogleError(res)}`);
  }
}
