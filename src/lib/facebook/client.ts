import "server-only";

import { getFacebookEnv } from "@/lib/facebook/env";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// pages_messaging lets us read/reply to Page inbox messages; the others
// cover posting, insights, and just listing which Pages the user manages.
export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "pages_messaging",
  "read_insights",
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
  const { appId } = getFacebookEnv();
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FACEBOOK_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface UserTokenResult {
  accessToken: string;
  expiresInSeconds: number | null;
}

export async function exchangeCodeForUserToken(code: string, redirectUri: string): Promise<UserTokenResult> {
  const { appId, appSecret } = getFacebookEnv();
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Facebook token exchange failed: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? null };
}

// Page access tokens derived from a long-lived user token (via
// fetchManagedPages below) are themselves effectively long-lived — this is
// what makes the Page connection durable without needing a refresh cron.
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<UserTokenResult> {
  const { appId, appSecret } = getFacebookEnv();
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Facebook long-lived token exchange failed: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? null };
}

export interface FacebookManagedPage {
  id: string;
  name: string;
  accessToken: string;
  pictureUrl: string | null;
}

interface RawManagedPage {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
}

// Lists every Page the authorizing user administers, each with its own
// Page-scoped access token — that token (not the user token) is what every
// other function in this file actually uses.
export async function fetchManagedPages(userAccessToken: string): Promise<FacebookManagedPage[]> {
  const url = new URL(`${GRAPH_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,picture{url}");
  url.searchParams.set("access_token", userAccessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch your Facebook Pages: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { data: RawManagedPage[] };
  return data.data.map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    pictureUrl: page.picture?.data?.url ?? null,
  }));
}

export interface FacebookPageProfile {
  id: string;
  name: string;
  fanCount: number | null;
  pictureUrl: string | null;
}

export async function fetchPageProfile(pageAccessToken: string, pageId: string): Promise<FacebookPageProfile> {
  const url = new URL(`${GRAPH_BASE}/${pageId}`);
  url.searchParams.set("fields", "id,name,fan_count,picture{url}");
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch the Facebook Page: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as {
    id: string;
    name: string;
    fan_count?: number;
    picture?: { data?: { url?: string } };
  };
  return {
    id: data.id,
    name: data.name,
    fanCount: data.fan_count ?? null,
    pictureUrl: data.picture?.data?.url ?? null,
  };
}

export interface FacebookPost {
  id: string;
  message: string | null;
  createdTime: string;
  permalinkUrl: string | null;
  fullPicture: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

export interface FacebookPostPage {
  items: FacebookPost[];
  nextCursor: string | null;
}

interface RawPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

export async function fetchPosts(
  pageAccessToken: string,
  pageId: string,
  after?: string | null,
): Promise<FacebookPostPage> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/posts`);
  url.searchParams.set(
    "fields",
    "id,message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares",
  );
  url.searchParams.set("limit", "12");
  url.searchParams.set("access_token", pageAccessToken);
  if (after) url.searchParams.set("after", after);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch Facebook posts: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { data: RawPost[]; paging?: { cursors?: { after?: string } } };
  const items: FacebookPost[] = data.data.map((post) => ({
    id: post.id,
    message: post.message ?? null,
    createdTime: post.created_time,
    permalinkUrl: post.permalink_url ?? null,
    fullPicture: post.full_picture ?? null,
    likeCount: post.likes?.summary?.total_count ?? 0,
    commentCount: post.comments?.summary?.total_count ?? 0,
    shareCount: post.shares?.count ?? 0,
  }));

  return { items, nextCursor: data.paging?.cursors?.after ?? null };
}

export async function createPost(pageAccessToken: string, pageId: string, message: string): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/feed`);
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    throw new Error(`Couldn't publish that post: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function createPhotoPost(
  pageAccessToken: string,
  pageId: string,
  message: string,
  imageBytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/photos`);
  url.searchParams.set("access_token", pageAccessToken);
  if (message) url.searchParams.set("caption", message);

  const formData = new FormData();
  formData.set("source", new Blob([imageBytes], { type: contentType }), "photo");

  const res = await fetch(url.toString(), { method: "POST", body: formData });
  if (!res.ok) {
    throw new Error(`Couldn't publish that photo: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { id?: string; post_id?: string };
  return data.post_id ?? data.id ?? "";
}

export async function updatePost(pageAccessToken: string, postId: string, message: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${postId}`);
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    throw new Error(`Couldn't update that post: ${await readGraphError(res)}`);
  }
}

export async function deletePost(pageAccessToken: string, postId: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${postId}`);
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Couldn't delete that post: ${await readGraphError(res)}`);
  }
}

export interface FacebookInsightValue {
  name: string;
  value: number;
}

// Metric availability drifts across Graph API versions (Page Insights in
// particular has had several deprecation waves) — fails soft to [] rather
// than breaking the whole page over one rejected metric, same reasoning as
// the Instagram/YouTube insights calls.
const PAGE_INSIGHT_METRICS = ["page_impressions", "page_post_engagements", "page_views_total"];

export async function fetchPageInsights(pageAccessToken: string, pageId: string): Promise<FacebookInsightValue[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);

  const url = new URL(`${GRAPH_BASE}/${pageId}/insights`);
  url.searchParams.set("metric", PAGE_INSIGHT_METRICS.join(","));
  url.searchParams.set("period", "day");
  url.searchParams.set("since", String(Math.floor(start.getTime() / 1000)));
  url.searchParams.set("until", String(Math.floor(end.getTime() / 1000)));
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { data?: { name: string; values?: { value: number }[] }[] };
  return (data.data ?? []).map((metric) => ({
    name: metric.name,
    value: (metric.values ?? []).reduce((sum, v) => sum + (typeof v.value === "number" ? v.value : 0), 0),
  }));
}

export interface FacebookConversation {
  id: string;
  participantId: string | null;
  participantName: string | null;
  updatedTime: string | null;
  snippet: string | null;
}

interface RawFbParticipant {
  id: string;
  name?: string;
}

interface RawFbConversation {
  id: string;
  updated_time?: string;
  participants?: { data: RawFbParticipant[] };
  messages?: { data: { message?: string }[] };
}

export async function fetchConversations(
  pageAccessToken: string,
  pageId: string,
  after?: string | null,
): Promise<{ items: FacebookConversation[]; nextCursor: string | null }> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/conversations`);
  url.searchParams.set("fields", "id,updated_time,participants,messages.limit(1){message}");
  url.searchParams.set("access_token", pageAccessToken);
  if (after) url.searchParams.set("after", after);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch Facebook conversations: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { data: RawFbConversation[]; paging?: { cursors?: { after?: string } } };
  const items: FacebookConversation[] = data.data.map((conversation) => {
    const participants = conversation.participants?.data ?? [];
    // The Page itself is always listed as one participant — the "other"
    // side is whichever entry's id isn't this Page's own id.
    const other = participants.find((p) => p.id !== pageId) ?? participants[0];
    return {
      id: conversation.id,
      participantId: other?.id ?? null,
      participantName: other?.name ?? null,
      updatedTime: conversation.updated_time ?? null,
      snippet: conversation.messages?.data?.[0]?.message ?? null,
    };
  });

  return { items, nextCursor: data.paging?.cursors?.after ?? null };
}

export interface FacebookMessage {
  id: string;
  fromName: string | null;
  text: string | null;
  createdTime: string;
}

interface RawFbMessage {
  id: string;
  message?: string;
  created_time: string;
  from?: { name?: string; id?: string };
}

export async function fetchConversationMessages(
  pageAccessToken: string,
  conversationId: string,
): Promise<FacebookMessage[]> {
  const url = new URL(`${GRAPH_BASE}/${conversationId}`);
  url.searchParams.set("fields", "messages.limit(30){message,from,created_time}");
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't fetch conversation messages: ${await readGraphError(res)}`);
  }

  const data = (await res.json()) as { messages?: { data: RawFbMessage[] } };
  const messages = data.messages?.data ?? [];

  // Newest-first from the API — a thread reads top-to-bottom oldest-first.
  return messages
    .map((m) => ({
      id: m.id,
      fromName: m.from?.name ?? m.from?.id ?? null,
      text: m.message ?? null,
      createdTime: m.created_time,
    }))
    .reverse();
}

// Same 24-hour messaging-window policy as Instagram applies here too —
// this is the Messenger Platform underneath both.
export async function sendMessage(pageAccessToken: string, recipientId: string, text: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (!res.ok) {
    throw new Error(`Couldn't send that message: ${await readGraphError(res)}`);
  }
}
