"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkStorageQuota } from "@/lib/plans/dal";
import { getInstagramConnection, attachReadState, ensureMessagingUserId } from "@/lib/instagram/dal";
import { getValidAccessToken } from "@/lib/instagram/token";
import {
  fetchMedia,
  fetchConversations,
  fetchConversationMessages,
  sendMessage,
  createMediaContainer,
  waitForContainerReady,
  publishMediaContainer,
  type InstagramMediaPage,
  type InstagramConversation,
  type InstagramMessage,
} from "@/lib/instagram/client";
import {
  getAiMode,
  setAiMode,
  getAiTypingState,
  getCommentAutomations,
  createCommentAutomation,
  setCommentAutomationEnabled,
  deleteCommentAutomation,
} from "@/lib/instagram/automation";
import type { InstagramCommentAutomation } from "@/types/database";

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
  const items = await attachReadState(organizationId, page.items);
  await ensureMessagingUserId(connection, page.ownerMessagingId);
  return { items, nextCursor: page.nextCursor };
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
  const items = await attachReadState(organizationId, page.items);
  await ensureMessagingUserId(connection, page.ownerMessagingId);
  return { items, nextCursor: page.nextCursor };
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

export async function getInstagramAiMode(organizationId: string, participantId: string): Promise<boolean> {
  await requireUser();
  return getAiMode(organizationId, participantId);
}

// Turning this on hands the conversation to the webhook handler entirely
// (see /api/instagram/webhook's POST) — every inbound message from this
// participant gets an AI-generated reply sent automatically, with no human
// review, for as long as it stays enabled.
export async function setInstagramAiMode(organizationId: string, participantId: string, enabled: boolean): Promise<void> {
  await requireUser();
  await setAiMode(organizationId, participantId, enabled);
}

export async function getInstagramAiTypingState(organizationId: string, participantId: string): Promise<boolean> {
  await requireUser();
  return getAiTypingState(organizationId, participantId);
}

export async function listCommentAutomations(organizationId: string): Promise<InstagramCommentAutomation[]> {
  await requireUser();
  return getCommentAutomations(organizationId);
}

export interface CommentAutomationFormState {
  error?: string;
  success?: boolean;
}

export async function addCommentAutomation(
  organizationId: string,
  input: { mediaId: string | null; keyword: string | null; replyTemplate: string },
): Promise<CommentAutomationFormState> {
  const user = await requireUser();
  const result = await createCommentAutomation(organizationId, user.id, input);
  if (result.error) return { error: result.error };
  revalidatePath(INSTAGRAM_PATH);
  return { success: true };
}

export async function toggleCommentAutomation(organizationId: string, automationId: string, enabled: boolean): Promise<void> {
  await requireUser();
  await setCommentAutomationEnabled(organizationId, automationId, enabled);
  revalidatePath(INSTAGRAM_PATH);
}

export async function removeCommentAutomation(organizationId: string, automationId: string): Promise<void> {
  await requireUser();
  await deleteCommentAutomation(organizationId, automationId);
  revalidatePath(INSTAGRAM_PATH);
}

const ALLOWED_POST_IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_POST_IMAGE_BYTES = 25 * 1024 * 1024;

export interface UploadPostState {
  error?: string;
  success?: boolean;
}

// Publishing is the one capability this product's API actually supports
// (see the doc comment on createMediaContainer in client.ts) — there's no
// edit or delete to pair with it.
export async function uploadInstagramPost(
  _prevState: UploadPostState,
  formData: FormData,
): Promise<UploadPostState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can publish to Instagram." };
  }

  const file = formData.get("image");
  const caption = String(formData.get("caption") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!ALLOWED_POST_IMAGE_TYPES.includes(file.type)) {
    return { error: "Image must be a JPEG or PNG." };
  }
  if (file.size > MAX_POST_IMAGE_BYTES) {
    return { error: "Image must be smaller than 25MB." };
  }

  const connection = await getInstagramConnection(organizationId);
  if (!connection) {
    return { error: "Instagram isn't connected." };
  }

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) {
    return { error: quotaError };
  }

  const supabase = await createClient();
  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${organizationId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("instagram-post-uploads")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    return { error: "Couldn't upload that image. You may not have permission to post." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("instagram-post-uploads").getPublicUrl(path);

  try {
    const accessToken = await getValidAccessToken(connection);
    const containerId = await createMediaContainer(accessToken, publicUrl, caption);
    await waitForContainerReady(accessToken, containerId);
    await publishMediaContainer(accessToken, containerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't publish that post." };
  }

  revalidatePath(INSTAGRAM_PATH);
  return { success: true };
}
