"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { getInstagramConnection } from "@/lib/instagram/dal";
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
  return fetchConversations(accessToken, after);
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
    await sendMessage(accessToken, recipientId, text.trim());
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that message." };
  }
}
