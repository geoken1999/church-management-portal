import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/instagram/token";
import {
  fetchMedia,
  fetchAccountInsights,
  fetchConversations,
  type InstagramMediaPage,
  type InstagramInsightValue,
  type InstagramConversation,
} from "@/lib/instagram/client";
import { getCommentAutomations } from "@/lib/instagram/automation";
import type { InstagramCommentAutomation } from "@/types/database";

// Returns the full row, including access_token — this file is server-only
// and every caller must be careful never to forward that field into a
// Client Component prop. Pages should destructure a safe subset before
// passing data down (see getInstagramDashboardData below).
export const getInstagramConnection = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instagram_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

// Inbound webhook events (messages, comments) carry the business account's
// messaging-scoped id but nothing that maps to a local organization_id —
// this is the only place that id is ever seen (as a byproduct of fetching
// conversations), so it's captured here, once, the first time it shows up
// for a connection that doesn't have it recorded yet.
export async function ensureMessagingUserId(
  connection: { id: string; organization_id: string; messaging_user_id: string | null },
  ownerMessagingId: string | null,
): Promise<void> {
  if (!ownerMessagingId || connection.messaging_user_id === ownerMessagingId) return;
  const supabase = await createClient();
  await supabase.from("instagram_connections").update({ messaging_user_id: ownerMessagingId }).eq("id", connection.id);
}

// Overlays this app's own read-tracking table onto conversations fetched
// from Instagram, since Instagram's API has no read/unread field of its
// own. A conversation is unread when the other person's last message came
// in after the org last viewed it (or was never viewed at all). Reads the
// whole org's read state in one query rather than per-conversation — this
// table stays small (one row per conversation ever opened).
export async function attachReadState(
  organizationId: string,
  items: InstagramConversation[],
): Promise<InstagramConversation[]> {
  const supabase = await createClient();
  const { data: reads } = await supabase
    .from("instagram_conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("organization_id", organizationId);

  const lastReadByConversation = new Map((reads ?? []).map((r) => [r.conversation_id, r.last_read_at]));

  return items.map((item) => {
    if (!item.lastInboundAt) return item;
    const lastReadAt = lastReadByConversation.get(item.id);
    const unread = !lastReadAt || new Date(item.lastInboundAt) > new Date(lastReadAt);
    return { ...item, unread };
  });
}

export interface InstagramConnectionSummary {
  username: string;
  accountType: string | null;
  profilePictureUrl: string | null;
  mediaCount: number | null;
  followersCount: number | null;
}

export type InstagramDashboardData =
  | { connected: false }
  | {
      connected: true;
      profile: InstagramConnectionSummary;
      media: InstagramMediaPage;
      insights: InstagramInsightValue[];
      conversations: { items: InstagramConversation[]; nextCursor: string | null };
      automations: InstagramCommentAutomation[];
      // True when the stored connection exists but the live Graph API calls
      // failed (expired/revoked token, Instagram outage, etc.) — the UI
      // shows a "reconnect" prompt instead of crashing the whole page.
      syncError: boolean;
    };

// Not cache()-wrapped: it performs live external calls and can write a
// refreshed token as a side effect, so it should run at most once per
// request rather than being memoized against accidental double-invocation.
export async function getInstagramDashboardData(organizationId: string): Promise<InstagramDashboardData> {
  const connection = await getInstagramConnection(organizationId);
  if (!connection) return { connected: false };

  const profile: InstagramConnectionSummary = {
    username: connection.username,
    accountType: connection.account_type,
    profilePictureUrl: connection.profile_picture_url,
    mediaCount: connection.media_count,
    followersCount: connection.followers_count,
  };

  // Independent of the Graph API calls below (a local DB read, not an
  // external call that can fail the whole page) — fetched unconditionally
  // rather than inside the try/catch.
  const automations = await getCommentAutomations(organizationId);

  try {
    const accessToken = await getValidAccessToken(connection);
    const [media, insights, conversationsPage] = await Promise.all([
      fetchMedia(accessToken),
      fetchAccountInsights(accessToken),
      fetchConversations(accessToken, connection.username),
    ]);
    const items = await attachReadState(organizationId, conversationsPage.items);
    await ensureMessagingUserId(connection, conversationsPage.ownerMessagingId);
    const conversations = { items, nextCursor: conversationsPage.nextCursor };
    return { connected: true, profile, media, insights, conversations, automations, syncError: false };
  } catch {
    return {
      connected: true,
      profile,
      media: { items: [], nextCursor: null },
      insights: [],
      conversations: { items: [], nextCursor: null },
      automations,
      syncError: true,
    };
  }
}
