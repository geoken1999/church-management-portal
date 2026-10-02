"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { getInstagramConnection, attachReadState } from "@/lib/instagram/dal";
import { getValidAccessToken } from "@/lib/instagram/token";
import {
  fetchMedia,
  fetchConversations,
  fetchConversationMessages,
  sendMessage,
  type InstagramMediaPage,
  type InstagramConversation,
  type InstagramMessage,
} from "@/lib/instagram/client";

const INSTAGRAM_PATH = "/dashboard/instagram";

export async function disconnectInstagram(formData: FormData) {
  await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const supabase = await createClient();
  // RLS restricts this to admins; a non-admin's request simply deletes
  // nothing rather than erroring.
  await supabase.from("instagram_connections").delete().eq("organization_id", organizationId);

  revalidatePath(INSTAGRAM_PATH);
}

export async function loadMoreInstagramMedia(organizationId: string, after: string): Promise<InstagramMediaPage> {
  await requireUser();
  const connection = await getInstagramConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  const accessToken = await getValidAccessToken(connection);
  return fetchMedia(accessToken, after);
}

export async function loadMoreInstagramConversations(
  organizationId: string,
  after: string,
): Promise<{ items: InstagramConversation[]; nextCursor: string | null }> {
  await requireUser();
  const connection = await getInstagramConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  const accessToken = await getValidAccessToken(connection);
  const page = await fetchConversations(accessToken, connection.username, after);
  page.items = await attachReadState(organizationId, page.items);
  return page;
}

// Polled by the Messages tab every so often to approximate real-time
// updates — this app reads Instagram by polling the Graph API rather than
// consuming its own webhook events, so "live" here means "re-fetch the
// first page and let the caller merge it," not a push update.
export async function refreshInstagramConversations(
  organizationId: string,
): Promise<{ items: InstagramConversation[]; nextCursor: string | null }> {
  await requireUser();
  const connection = await getInstagramConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  const accessToken = await getValidAccessToken(connection);
  const page = await fetchConversations(accessToken, connection.username);
  page.items = await attachReadState(organizationId, page.items);
  return page;
}

export async function getInstagramConversationMessages(
  organizationId: string,
  conversationId: string,
): Promise<InstagramMessage[]> {
  await requireUser();
  const connection = await getInstagramConnection(organizationId);
  if (!connection) return [];

  const accessToken = await getValidAccessToken(connection);
  return fetchConversationMessages(accessToken, conversationId);
}

export interface SendReplyState {
  error?: string;
  success?: boolean;
}

export async function sendInstagramReply(
  organizationId: string,
  recipientId: string,
  text: string,
  useHumanAgentTag?: boolean,
): Promise<SendReplyState> {
  await requireUser();
  if (!text.trim()) {
    return { error: "Message can't be empty." };
  }

  const connection = await getInstagramConnection(organizationId);
  if (!connection) {
    return { error: "Instagram isn't connected." };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    await sendMessage(accessToken, recipientId, text.trim(), useHumanAgentTag);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that message." };
  }
}

// Instagram's own Conversations API has no read/unread field (confirmed by
// testing it directly — unsupported field names here are silently dropped,
// not errored, and unread_count comes back the same way as a made-up
// field). instagram_conversation_reads is this app's own substitute: the
// whole org shares one "last viewed" timestamp per conversation, since this
// is a team inbox, not a personal one. supabase-js never throws on a failed
// write (it returns {error} instead), so an environment that hasn't run
// this table's migration yet just quietly keeps showing everything as
// unread rather than breaking the page.
export async function markInstagramConversationRead(organizationId: string, conversationId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from("instagram_conversation_reads")
    .upsert(
      { organization_id: organizationId, conversation_id: conversationId, last_read_at: new Date().toISOString() },
      { onConflict: "organization_id,conversation_id" },
    );
}
