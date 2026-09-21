import "server-only";

import { getYouTubeEnv } from "@/lib/youtube/env";
import { getSiteUrl } from "@/lib/site-url";

const DATA_API_BASE = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API_BASE = "https://youtubeanalytics.googleapis.com/v2";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// The full "youtube" scope is required for live broadcast management
// (liveBroadcasts/liveStreams insert, bind, transition) — Google doesn't
// cover that under force-ssl. It is NOT, despite being the broadest "manage"
// scope, a superset of force-ssl: Google's own API requires force-ssl
// specifically for commentThreads.list/insert, and "youtube" alone 403s
// those calls with "insufficient authentication scopes" (confirmed against
// the live API). Both scopes are needed together.
//
// NOTE: any org connected before this scope was added needs to click
// "Reconnect" once — their existing token was issued under the old,
// narrower scope set and can't read/manage comments (or broadcasts, if
// connected before that scope) until re-consented.
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
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

// YouTube's own classification, not a guess based on duration. "live" comes
// from the Data API's liveStreamingDetails (a definitive signal — see
// fetchVideos); "short" vs "video" comes from checkIsShort below. "unknown"
// covers the rare case where the Shorts check itself fails (network error,
// unexpected response), not a normal/expected outcome.
export type YouTubeContentType = "video" | "short" | "live" | "unknown";

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  privacyStatus: string;
  durationSeconds: number;
  contentType: YouTubeContentType;
}

// Parses YouTube's ISO 8601 duration format (e.g. "PT1M30S", "PT45S") —
// only handles the hours/minutes/seconds a normal video ever has, not the
// full ISO 8601 duration grammar.
function parseIsoDuration(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
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
  status?: { privacyStatus?: string };
  contentDetails?: { duration?: string };
  // Presence of this object at all (regardless of its contents) is the
  // Data API's own signal that a video originated from a live broadcast —
  // currently live, upcoming, or an ended stream now stored as a VOD.
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string; scheduledStartTime?: string };
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

  const statsById = await fetchVideoStatsMap(accessToken, videoIds);

  // liveStreamingDetails' presence is a definitive Data API signal — a
  // video is never simultaneously a livestream and a Short, so those IDs
  // skip the /shorts/ routing check entirely below.
  const liveVideoIds = new Set(videoIds.filter((id) => statsById.get(id)?.liveStreamingDetails));
  const contentTypeById = await fetchVideoContentTypes(videoIds.filter((id) => !liveVideoIds.has(id)));

  const items: YouTubeVideo[] = listData.items.map((item) => {
    const videoId = item.contentDetails.videoId;
    const details = statsById.get(videoId);
    const contentType: YouTubeContentType = liveVideoIds.has(videoId)
      ? "live"
      : (contentTypeById.get(videoId) ?? "unknown");
    return {
      id: videoId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? null,
      publishedAt: item.snippet.publishedAt,
      viewCount: details?.statistics?.viewCount ? Number(details.statistics.viewCount) : 0,
      likeCount: details?.statistics?.likeCount ? Number(details.statistics.likeCount) : 0,
      commentCount: details?.statistics?.commentCount ? Number(details.statistics.commentCount) : 0,
      privacyStatus: details?.status?.privacyStatus ?? "public",
      durationSeconds: parseIsoDuration(details?.contentDetails?.duration ?? "PT0S"),
      contentType,
    };
  });

  return { items, nextCursor: listData.nextPageToken ?? null };
}

type VideoStatsDetails = Pick<RawVideoStats, "statistics" | "status" | "contentDetails" | "liveStreamingDetails">;

async function fetchVideoStatsMap(accessToken: string, videoIds: string[]): Promise<Map<string, VideoStatsDetails>> {
  const statsById = new Map<string, VideoStatsDetails>();
  if (videoIds.length === 0) return statsById;

  const statsUrl = new URL(`${DATA_API_BASE}/videos`);
  statsUrl.searchParams.set("part", "statistics,status,contentDetails,liveStreamingDetails");
  statsUrl.searchParams.set("id", videoIds.join(","));

  const statsRes = await fetch(statsUrl.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (statsRes.ok) {
    const statsData = (await statsRes.json()) as { items: RawVideoStats[] };
    for (const item of statsData.items) {
      statsById.set(item.id, {
        statistics: item.statistics,
        status: item.status,
        contentDetails: item.contentDetails,
        liveStreamingDetails: item.liveStreamingDetails,
      });
    }
  }

  return statsById;
}

// YouTube's Data API has no field for a video's actual Shorts
// classification, and the Analytics API's creatorContentType dimension
// didn't pan out in practice (either a dimension-combination restriction
// or an enum-value mismatch — either way, it silently returned nothing).
// This instead checks the real /shorts/{id} URL directly: YouTube redirects
// away to the normal watch page if the video isn't a Short, and serves it
// as-is (200, no redirect) if it is — that's YouTube's own routing
// decision, not a guess. Runs against www.youtube.com directly rather than
// the Data/Analytics API, so no OAuth token is involved; redirect: "manual"
// stops fetch from following the redirect so the 3xx status itself is the
// signal, and any request that errors or returns something unexpected
// falls back to "unknown" rather than guessing.
async function checkIsShort(videoId: string): Promise<YouTubeContentType> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) return "video";
    if (res.status === 200) return "short";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function fetchVideoContentTypes(videoIds: string[]): Promise<Map<string, YouTubeContentType>> {
  const result = new Map<string, YouTubeContentType>();
  if (videoIds.length === 0) return result;

  const entries = await Promise.all(videoIds.map(async (id) => [id, await checkIsShort(id)] as const));
  for (const [id, type] of entries) {
    result.set(id, type);
  }

  return result;
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

export interface YouTubeBroadcast {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  scheduledStartTime: string | null;
  actualStartTime: string | null;
}

interface RawBroadcast {
  id: string;
  snippet: {
    title: string;
    thumbnails?: { medium?: { url?: string } };
    scheduledStartTime?: string;
    actualStartTime?: string;
  };
}

// liveBroadcasts.list (not search.list) — same information for broadcasts
// this channel created via Studio/API, at 1 API-quota unit instead of
// search.list's 100, since this runs on every dashboard page load.
async function fetchBroadcastsByStatus(
  accessToken: string,
  status: "active" | "upcoming",
): Promise<YouTubeBroadcast[]> {
  const url = new URL(`${DATA_API_BASE}/liveBroadcasts`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("broadcastStatus", status);
  url.searchParams.set("broadcastType", "all");
  url.searchParams.set("maxResults", "5");

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { items: RawBroadcast[] };
  return data.items.map((item) => ({
    id: item.id,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? null,
    scheduledStartTime: item.snippet.scheduledStartTime ?? null,
    actualStartTime: item.snippet.actualStartTime ?? null,
  }));
}

export async function fetchLiveBroadcasts(
  accessToken: string,
): Promise<{ live: YouTubeBroadcast[]; upcoming: YouTubeBroadcast[] }> {
  const [live, upcoming] = await Promise.all([
    fetchBroadcastsByStatus(accessToken, "active"),
    fetchBroadcastsByStatus(accessToken, "upcoming"),
  ]);
  return { live, upcoming };
}

export interface YouTubeTopVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  comments: number;
}

interface RawVideoSnippet {
  id: string;
  snippet: { title: string; thumbnails?: { medium?: { url?: string } } };
}

// Ranks videos published/active in the last 28 days by views, via the
// Analytics API's per-video breakdown — fails soft to [] since this is a
// supplementary "highlight reel," not core functionality.
export async function fetchTopVideos(accessToken: string): Promise<YouTubeTopVideo[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  const toDateString = (d: Date) => d.toISOString().slice(0, 10);

  const url = new URL(`${ANALYTICS_API_BASE}/reports`);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", toDateString(start));
  url.searchParams.set("endDate", toDateString(end));
  url.searchParams.set("metrics", "views,likes,comments");
  url.searchParams.set("dimensions", "video");
  url.searchParams.set("sort", "-views");
  url.searchParams.set("maxResults", "5");

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { rows?: [string, number, number, number][] };
  const rows = data.rows ?? [];
  if (rows.length === 0) return [];

  const detailsById = new Map<string, { title: string; thumbnailUrl: string | null }>();
  const detailsUrl = new URL(`${DATA_API_BASE}/videos`);
  detailsUrl.searchParams.set("part", "snippet");
  detailsUrl.searchParams.set("id", rows.map(([videoId]) => videoId).join(","));

  const detailsRes = await fetch(detailsUrl.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (detailsRes.ok) {
    const detailsData = (await detailsRes.json()) as { items: RawVideoSnippet[] };
    for (const item of detailsData.items) {
      detailsById.set(item.id, {
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? null,
      });
    }
  }

  return rows.map(([videoId, views, likes, comments]) => ({
    id: videoId,
    title: detailsById.get(videoId)?.title ?? videoId,
    thumbnailUrl: detailsById.get(videoId)?.thumbnailUrl ?? null,
    views,
    likes,
    comments,
  }));
}

// ---------------------------------------------------------------------------
// Live broadcast management — the app manages the broadcast's lifecycle
// (create, go live, end) and hands back a stream key; actually capturing and
// encoding camera/mic still happens in dedicated streaming software (OBS,
// Streamlabs, a phone streaming app) pointed at that key. Browsers have no
// way to push RTMP directly, which is what YouTube's ingestion requires.
// ---------------------------------------------------------------------------

export interface YouTubeStreamKey {
  streamId: string;
  ingestionAddress: string;
  streamName: string;
}

interface RawStream {
  id: string;
  cdn: { ingestionInfo: { ingestionAddress: string; streamName: string } };
}

export async function createLiveStream(accessToken: string, title: string): Promise<YouTubeStreamKey> {
  const url = new URL(`${DATA_API_BASE}/liveStreams`);
  url.searchParams.set("part", "snippet,cdn,contentDetails");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      snippet: { title },
      cdn: { frameRate: "variable", ingestionType: "rtmp", resolution: "variable" },
      contentDetails: { isReusable: true },
    }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't create the stream: ${await readGoogleError(res)}`);
  }

  const data = (await res.json()) as RawStream;
  return {
    streamId: data.id,
    ingestionAddress: data.cdn.ingestionInfo.ingestionAddress,
    streamName: data.cdn.ingestionInfo.streamName,
  };
}

export async function getStreamKey(accessToken: string, streamId: string): Promise<YouTubeStreamKey | null> {
  const url = new URL(`${DATA_API_BASE}/liveStreams`);
  url.searchParams.set("part", "cdn");
  url.searchParams.set("id", streamId);

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as { items: RawStream[] };
  const item = data.items[0];
  if (!item) return null;

  return {
    streamId: item.id,
    ingestionAddress: item.cdn.ingestionInfo.ingestionAddress,
    streamName: item.cdn.ingestionInfo.streamName,
  };
}

export type YouTubePrivacyStatus = "public" | "unlisted" | "private";

export interface CreateBroadcastInput {
  title: string;
  description: string;
  privacyStatus: YouTubePrivacyStatus;
}

interface RawManagedBroadcast {
  id: string;
  snippet: { title: string; scheduledStartTime?: string };
  status: { lifeCycleStatus: string; privacyStatus: string };
  contentDetails?: { boundStreamId?: string };
}

export interface YouTubeManagedBroadcast {
  id: string;
  title: string;
  lifeCycleStatus: string;
  privacyStatus: string;
  streamId: string | null;
}

function toManagedBroadcast(item: RawManagedBroadcast): YouTubeManagedBroadcast {
  return {
    id: item.id,
    title: item.snippet.title,
    lifeCycleStatus: item.status.lifeCycleStatus,
    privacyStatus: item.status.privacyStatus,
    streamId: item.contentDetails?.boundStreamId ?? null,
  };
}

export async function createLiveBroadcast(
  accessToken: string,
  input: CreateBroadcastInput,
): Promise<YouTubeManagedBroadcast> {
  const url = new URL(`${DATA_API_BASE}/liveBroadcasts`);
  url.searchParams.set("part", "snippet,status,contentDetails");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      snippet: {
        title: input.title,
        description: input.description,
        // Immediate go-live only (no scheduling UI yet) — YouTube still
        // requires some value here even though we transition manually.
        scheduledStartTime: new Date().toISOString(),
      },
      status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: false, enableAutoStop: false, enableDvr: true },
    }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't create the broadcast: ${await readGoogleError(res)}`);
  }

  return toManagedBroadcast((await res.json()) as RawManagedBroadcast);
}

export async function bindBroadcastToStream(accessToken: string, broadcastId: string, streamId: string): Promise<void> {
  const url = new URL(`${DATA_API_BASE}/liveBroadcasts/bind`);
  url.searchParams.set("id", broadcastId);
  url.searchParams.set("streamId", streamId);
  url.searchParams.set("part", "id,contentDetails");

  const res = await fetch(url.toString(), { method: "POST", headers: authHeaders(accessToken) });
  if (!res.ok) {
    throw new Error(`Couldn't attach the stream to the broadcast: ${await readGoogleError(res)}`);
  }
}

// Statuses observed while managing a broadcast, ordered created -> ready ->
// testing -> live -> complete. Only testing/live are explicit transitions
// this app triggers; created/ready happen automatically once bound.
export async function transitionBroadcast(
  accessToken: string,
  broadcastId: string,
  status: "testing" | "live" | "complete",
): Promise<YouTubeManagedBroadcast> {
  const url = new URL(`${DATA_API_BASE}/liveBroadcasts/transition`);
  url.searchParams.set("broadcastStatus", status);
  url.searchParams.set("id", broadcastId);
  url.searchParams.set("part", "snippet,status,contentDetails");

  const res = await fetch(url.toString(), { method: "POST", headers: authHeaders(accessToken) });
  if (!res.ok) {
    throw new Error(`Couldn't update the stream status: ${await readGoogleError(res)}`);
  }

  return toManagedBroadcast((await res.json()) as RawManagedBroadcast);
}

export async function deleteBroadcast(accessToken: string, broadcastId: string): Promise<void> {
  const url = new URL(`${DATA_API_BASE}/liveBroadcasts`);
  url.searchParams.set("id", broadcastId);

  const res = await fetch(url.toString(), { method: "DELETE", headers: authHeaders(accessToken) });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Couldn't cancel the broadcast: ${await readGoogleError(res)}`);
  }
}

const BROADCAST_STATUS_PRIORITY: Record<string, number> = {
  live: 0,
  testing: 1,
  ready: 2,
  created: 3,
};

// Returns the single broadcast most relevant to "manage my current
// livestream" — whichever non-terminal broadcast is furthest along
// (live > testing > ready > created), ignoring anything already
// complete/revoked.
export async function findActiveManagedBroadcast(accessToken: string): Promise<YouTubeManagedBroadcast | null> {
  const url = new URL(`${DATA_API_BASE}/liveBroadcasts`);
  url.searchParams.set("part", "snippet,status,contentDetails");
  url.searchParams.set("broadcastType", "all");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "25");

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as { items: RawManagedBroadcast[] };
  const candidates = data.items
    .map(toManagedBroadcast)
    .filter((b) => b.lifeCycleStatus in BROADCAST_STATUS_PRIORITY)
    .sort((a, b) => BROADCAST_STATUS_PRIORITY[a.lifeCycleStatus] - BROADCAST_STATUS_PRIORITY[b.lifeCycleStatus]);

  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Video management — edit, delete, and upload
// ---------------------------------------------------------------------------

export interface YouTubeVideoDetails {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  privacyStatus: YouTubePrivacyStatus;
}

interface RawVideoDetails {
  id: string;
  snippet: { title: string; description?: string; categoryId?: string };
  status: { privacyStatus: string };
}

export async function fetchVideoDetails(accessToken: string, videoId: string): Promise<YouTubeVideoDetails | null> {
  const url = new URL(`${DATA_API_BASE}/videos`);
  url.searchParams.set("part", "snippet,status");
  url.searchParams.set("id", videoId);

  const res = await fetch(url.toString(), { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as { items: RawVideoDetails[] };
  const item = data.items[0];
  if (!item) return null;

  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description ?? "",
    // Falls back to "People & Blogs" — videos.update requires re-sending
    // the whole snippet, and a missing categoryId on that write can reset
    // it, so this always carries the video's existing value forward.
    categoryId: item.snippet.categoryId ?? "22",
    privacyStatus: (item.status.privacyStatus as YouTubePrivacyStatus) ?? "public",
  };
}

export async function updateVideoDetails(
  accessToken: string,
  input: { id: string; title: string; description: string; categoryId: string; privacyStatus: YouTubePrivacyStatus },
): Promise<void> {
  const url = new URL(`${DATA_API_BASE}/videos`);
  url.searchParams.set("part", "snippet,status");

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      snippet: { title: input.title, description: input.description, categoryId: input.categoryId },
      status: { privacyStatus: input.privacyStatus },
    }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't update the video: ${await readGoogleError(res)}`);
  }
}

export async function deleteVideo(accessToken: string, videoId: string): Promise<void> {
  const url = new URL(`${DATA_API_BASE}/videos`);
  url.searchParams.set("id", videoId);

  const res = await fetch(url.toString(), { method: "DELETE", headers: authHeaders(accessToken) });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Couldn't delete the video: ${await readGoogleError(res)}`);
  }
}

export interface UploadVideoInput {
  title: string;
  description: string;
  privacyStatus: YouTubePrivacyStatus;
  fileSize: number;
  contentType: string;
}

// Starts a resumable upload session and hands back Google's session URL —
// NOT the access token. Per Google's resumable upload protocol, that
// session URL is itself pre-authorized, so the browser can PUT the actual
// video bytes straight to Google from there without ever holding the
// OAuth token. This is what makes browser-side upload possible at all: a
// multi-GB file has no business round-tripping through our own serverless
// functions (body-size and execution-time limits both rule that out).
export async function initiateResumableUpload(accessToken: string, input: UploadVideoInput): Promise<string> {
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/videos");
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("part", "snippet,status");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
      "X-Upload-Content-Type": input.contentType,
      "X-Upload-Content-Length": String(input.fileSize),
      // Google only enables CORS on the resulting session for the origin
      // that requested it — without this, the browser's follow-up PUT
      // still completes on Google's side (the video gets created) but the
      // browser can't read the response and reports it as a network error.
      Origin: getSiteUrl(),
    },
    body: JSON.stringify({
      snippet: { title: input.title, description: input.description },
      status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false },
    }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't start the upload: ${await readGoogleError(res)}`);
  }

  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("YouTube didn't return an upload session URL.");
  }

  return uploadUrl;
}

// Thumbnails are small (2MB max) — unlike video upload, this comfortably
// fits through our own Server Action rather than needing a direct
// browser-to-Google session.
export async function setVideoThumbnail(
  accessToken: string,
  videoId: string,
  imageBytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/thumbnails/set");
  url.searchParams.set("videoId", videoId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": contentType },
    body: imageBytes,
  });

  if (!res.ok) {
    throw new Error(`Couldn't update the thumbnail: ${await readGoogleError(res)}`);
  }
}
