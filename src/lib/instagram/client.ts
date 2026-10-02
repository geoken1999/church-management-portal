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
  // The most recent message's sender/time, within the small window fetched
  // alongside the conversation list — used to work out whether Instagram's
  // 24-hour (or 7-day, tagged) reply window is still open, and whether the
  // business has ever replied at all (a never-answered "request").
  lastMessageFromOwner: boolean | null;
  lastInboundAt: string | null;
  // Always false here — Instagram's API has no read/unread field at all.
  // Set by the dal/actions layer from this app's own read-tracking table.
  unread: boolean;
}

interface RawParticipant {
  id: string;
  username?: string;
}

interface RawConversationMessage {
  message?: string;
  from?: { username?: string; id?: string };
  created_time?: string;
}

interface RawConversation {
  id: string;
  updated_time?: string;
  participants?: { data: RawParticipant[] };
  messages?: { data: RawConversationMessage[] };
}

export interface ConversationsPage {
  items: InstagramConversation[];
  nextCursor: string | null;
  // The connected account's own id in this product's messaging-scoped id
  // namespace (see the comment below) — found as a byproduct of resolving
  // "other" on each conversation. Null only when the page has zero
  // conversations to find it from. Persisted by the dal layer so inbound
  // webhook events (which arrive carrying only this same namespace) can be
  // matched back to an organization.
  ownerMessagingId: string | null;
}

export async function fetchConversations(
  accessToken: string,
  ownerUsername: string,
  after?: string | null,
): Promise<ConversationsPage> {
  const url = new URL(`${GRAPH_BASE}/me/conversations`);
  url.searchParams.set("platform", "instagram");
  // limit(5) rather than limit(1): the single most recent message might be
  // our own reply, which says nothing about when the *other* person last
  // wrote — need a short window of recent messages to find their last one.
  url.searchParams.set("fields", "id,updated_time,participants,messages.limit(5){message,from,created_time}");
  url.searchParams.set("access_token", accessToken);
  if (after) url.searchParams.set("after", after);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch Instagram conversations: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as RawPage<RawConversation>;
  let ownerMessagingId: string | null = null;
  const items: InstagramConversation[] = data.data.map((c) => {
    const participants = c.participants?.data ?? [];
    // The API lists both sides of the DM, each with a username — this
    // account's own profile is always included first. Can't pick out the
    // "other" one by id: the id Instagram returns here for the connected
    // account (a messaging-scoped id) doesn't match instagram_user_id (the
    // id from the profile endpoint) — same account, two different id
    // namespaces. Username is the one field that's consistent across both.
    const mine = participants.find((p) => p.username === ownerUsername);
    const other = participants.find((p) => p.username !== ownerUsername) ?? participants[0];
    if (mine?.id) ownerMessagingId = mine.id;

    const recentMessages = c.messages?.data ?? [];
    const lastInbound = recentMessages.find((m) => m.from?.username !== ownerUsername);

    return {
      id: c.id,
      participantId: other?.id ?? null,
      participantUsername: other?.username ?? null,
      updatedTime: c.updated_time ?? null,
      snippet: recentMessages[0]?.message ?? null,
      lastMessageFromOwner: recentMessages[0] ? recentMessages[0].from?.username === ownerUsername : null,
      lastInboundAt: lastInbound?.created_time ?? null,
      unread: false,
    };
  });

  return { items, nextCursor: data.paging?.cursors?.after ?? null, ownerMessagingId };
}

// Used by the webhook handler: an inbound message event carries only the
// sender's id, not Instagram's opaque conversation id, so this looks the
// conversation up by participant instead of paging through the full list.
export async function fetchConversationMessagesByParticipant(
  accessToken: string,
  participantId: string,
  limit = 10,
): Promise<InstagramMessage[]> {
  const url = new URL(`${GRAPH_BASE}/me/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("user_id", participantId);
  url.searchParams.set("fields", `messages.limit(${limit}){message,from,created_time}`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch Instagram conversation: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as RawPage<{ messages?: { data: RawMessage[] } }>;
  const messages = data.data[0]?.messages?.data ?? [];
  return messages
    .map((m) => ({
      id: m.id,
      fromUsername: m.from?.username ?? m.from?.id ?? null,
      text: m.message ?? null,
      createdTime: m.created_time,
    }))
    .reverse();
}

// The policy-compliant way to DM someone in response to their public
// comment — a regular /me/messages send to their id is still subject to
// the normal 24-hour conversation window (and most commenters have never
// messaged the account at all, so there'd be no window open regardless).
// Addressing the comment itself bypasses that: Meta allows exactly one
// private reply per comment, usable up to 7 days after it was posted.
export async function sendPrivateReply(accessToken: string, commentId: string, text: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't send private reply: ${await readGraphError(res)}`);
  }
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

// Instagram's messaging policy only allows replying within 24 hours of the
// user's last message — past that, a send fails unless tagged HUMAN_AGENT,
// which Meta allows for up to 7 days specifically because a real person
// (not a bot/automation) is responding. useHumanAgentTag is decided by the
// caller from how long ago the user's last message was.
export async function sendMessage(
  accessToken: string,
  recipientId: string,
  text: string,
  useHumanAgentTag?: boolean,
): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      ...(useHumanAgentTag ? { tag: "HUMAN_AGENT" } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Couldn't send that message: ${await readGraphError(res)}`);
  }
}

// Publishing a new post is a two-step Graph API call: create a container
// referencing a publicly-fetchable image URL, then publish that container.
// Editing a caption or deleting a published post afterward is NOT possible
// through this API at all (confirmed against Meta's own IG Media reference
// for this specific product — POST on a media object only supports
// toggling comments, and DELETE is explicitly documented as
// Facebook-Login-product-only) — once published, removing a post means
// going into the Instagram app directly, same as today.
export async function createMediaContainer(accessToken: string, imageUrl: string, caption: string): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/me/media`);
  url.searchParams.set("image_url", imageUrl);
  if (caption) url.searchParams.set("caption", caption);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    throw new Error(`Couldn't prepare that post: ${await readGraphError(res)}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

interface ContainerStatus {
  status_code?: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
}

// Images are usually ready immediately, but polling instead of publishing
// right away guards against the rarer case where Instagram's fetch of the
// image URL hasn't finished yet — publishing an IN_PROGRESS container
// fails outright rather than queueing.
export async function waitForContainerReady(accessToken: string, containerId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = new URL(`${GRAPH_BASE}/${containerId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Couldn't check post status: ${await readGraphError(res)}`);
    }
    const data = (await res.json()) as ContainerStatus;
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error("Instagram couldn't process that image.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Instagram is still processing that image — try publishing again in a moment.");
}

export async function publishMediaContainer(accessToken: string, containerId: string): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/me/media_publish`);
  url.searchParams.set("creation_id", containerId);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    throw new Error(`Couldn't publish that post: ${await readGraphError(res)}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
