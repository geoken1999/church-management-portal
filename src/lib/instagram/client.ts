import "server-only";

import { getInstagramEnv } from "@/lib/instagram/env";

// "Instagram API with Instagram Login" — the account connects directly via
// instagram.com OAuth, no linked Facebook Page required. OAuth endpoints
// live on api.instagram.com/instagram.com; everything after token exchange
// goes through graph.instagram.com.
const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

// instagram_business_manage_comments isn't used by this app yet but costs
// nothing to request now — re-requesting scopes later means every
// connected account has to reconnect.
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_manage_insights",
].join(",");

async function readGraphError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const { appId } = getInstagramEnv();
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface ShortLivedTokenResult {
  accessToken: string;
  instagramUserId: string;
}

export async function exchangeCodeForShortLivedToken(
  code: string,
  redirectUri: string,
): Promise<ShortLivedTokenResult> {
  const { appId, appSecret } = getInstagramEnv();
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Instagram token exchange failed: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; user_id: number | string };
  return { accessToken: data.access_token, instagramUserId: String(data.user_id) };
}

export interface LongLivedTokenResult {
  accessToken: string;
  expiresInSeconds: number;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResult> {
  const { appSecret } = getInstagramEnv();
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Instagram long-lived token exchange failed: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

export async function refreshLongLivedToken(accessToken: string): Promise<LongLivedTokenResult> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Instagram token refresh failed: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

export interface InstagramProfile {
  id: string;
  username: string;
  accountType: string | null;
  mediaCount: number | null;
  followersCount: number | null;
  profilePictureUrl: string | null;
}

interface RawProfile {
  id: string;
  username: string;
  account_type?: string;
  media_count?: number;
  followers_count?: number;
  profile_picture_url?: string;
}

export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,username,account_type,media_count,followers_count,profile_picture_url");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch the Instagram profile: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as RawProfile;
  return {
    id: data.id,
    username: data.username,
    accountType: data.account_type ?? null,
    mediaCount: data.media_count ?? null,
    followersCount: data.followers_count ?? null,
    profilePictureUrl: data.profile_picture_url ?? null,
  };
}

export interface InstagramMedia {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
}

export interface InstagramMediaPage {
  items: InstagramMedia[];
  nextCursor: string | null;
}

interface RawMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface RawPage<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export async function fetchMedia(accessToken: string, after?: string | null): Promise<InstagramMediaPage> {
  const url = new URL(`${GRAPH_BASE}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "12");
  if (after) url.searchParams.set("after", after);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch Instagram posts: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as RawPage<RawMedia>;
  const items: InstagramMedia[] = data.data.map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    mediaType: m.media_type,
    mediaUrl: m.media_url ?? null,
    thumbnailUrl: m.thumbnail_url ?? null,
    permalink: m.permalink,
    timestamp: m.timestamp,
    likeCount: m.like_count ?? 0,
    commentsCount: m.comments_count ?? 0,
  }));

  return { items, nextCursor: data.paging?.cursors?.after ?? null };
}

export interface InstagramInsightValue {
  name: string;
  value: number;
}

interface RawInsight {
  name: string;
  values?: { value: number }[];
  total_value?: { value?: number };
}

// Valid metrics differ by media type and drift across API versions — a bad
// metric name 400s the *entire* request rather than just omitting that
// metric, so this fails soft (returns []) instead of breaking the whole
// posts view over one rejected insights call.
const MEDIA_INSIGHT_METRICS_BY_TYPE: Record<string, string[]> = {
  IMAGE: ["reach", "saved", "likes", "comments", "shares", "total_interactions"],
  CAROUSEL_ALBUM: ["reach", "saved", "likes", "comments", "shares", "total_interactions"],
  VIDEO: ["reach", "saved", "likes", "comments", "shares", "total_interactions", "plays"],
  REELS: ["reach", "saved", "likes", "comments", "shares", "total_interactions", "plays"],
};

export async function fetchMediaInsights(
  accessToken: string,
  mediaId: string,
  mediaType: string,
): Promise<InstagramInsightValue[]> {
  const metrics = MEDIA_INSIGHT_METRICS_BY_TYPE[mediaType] ?? ["reach", "likes", "comments"];
  const url = new URL(`${GRAPH_BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as RawPage<RawInsight>;
  return data.data.map((m) => ({
    name: m.name,
    value: m.values?.[0]?.value ?? m.total_value?.value ?? 0,
  }));
}

const ACCOUNT_INSIGHT_METRICS = ["reach", "profile_views", "accounts_engaged", "total_interactions"];

export async function fetchAccountInsights(accessToken: string): Promise<InstagramInsightValue[]> {
  const url = new URL(`${GRAPH_BASE}/me/insights`);
  url.searchParams.set("metric", ACCOUNT_INSIGHT_METRICS.join(","));
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as RawPage<RawInsight>;
  return data.data.map((m) => ({
    name: m.name,
    value: m.total_value?.value ?? m.values?.[0]?.value ?? 0,
  }));
}

export interface InstagramConversation {
  id: string;
  participantId: string | null;
  participantUsername: string | null;
  updatedTime: string | null;
  snippet: string | null;
}

interface RawParticipant {
  id: string;
  username?: string;
}

interface RawConversation {
  id: string;
  updated_time?: string;
  participants?: { data: RawParticipant[] };
  messages?: { data: { message?: string }[] };
}

export async function fetchConversations(
  accessToken: string,
  after?: string | null,
): Promise<{ items: InstagramConversation[]; nextCursor: string | null }> {
  const url = new URL(`${GRAPH_BASE}/me/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("fields", "id,updated_time,participants,messages.limit(1){message}");
  url.searchParams.set("access_token", accessToken);
  if (after) url.searchParams.set("after", after);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch Instagram conversations: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as RawPage<RawConversation>;
  const items: InstagramConversation[] = data.data.map((c) => {
    const participants = c.participants?.data ?? [];
    // The API lists both sides of the DM — the "other" participant is
    // whichever one isn't this connected account itself. Falls back to the
    // first entry if that can't be determined.
    const other = participants.find((p) => p.username) ?? participants[0];
    return {
      id: c.id,
      participantId: other?.id ?? null,
      participantUsername: other?.username ?? null,
      updatedTime: c.updated_time ?? null,
      snippet: c.messages?.data?.[0]?.message ?? null,
    };
  });

  return { items, nextCursor: data.paging?.cursors?.after ?? null };
}

export interface InstagramMessage {
  id: string;
  fromUsername: string | null;
  text: string | null;
  createdTime: string;
}

interface RawMessage {
  id: string;
  message?: string;
  created_time: string;
  from?: { username?: string; id?: string };
}

export async function fetchConversationMessages(
  accessToken: string,
  conversationId: string,
): Promise<InstagramMessage[]> {
  const url = new URL(`${GRAPH_BASE}/${conversationId}`);
  url.searchParams.set("fields", "messages.limit(30){message,from,created_time}");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch conversation messages: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { messages?: { data: RawMessage[] } };
  const messages = data.messages?.data ?? [];

  // The API returns newest-first; a message thread reads top-to-bottom
  // oldest-first, like every chat UI.
  return messages
    .map((m) => ({
      id: m.id,
      fromUsername: m.from?.username ?? m.from?.id ?? null,
      text: m.message ?? null,
      createdTime: m.created_time,
    }))
    .reverse();
}

// Instagram's messaging policy only allows replying within a 24-hour window
// of the user's last message (outside a small set of tagged exceptions this
// app doesn't use) — a send outside that window fails with a Graph API
// error, which surfaces to the caller as a thrown Error.
export async function sendMessage(accessToken: string, recipientId: string, text: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't send that message: ${await readGraphError(res)}`);
  }
}
