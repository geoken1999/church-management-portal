"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { getFacebookConnection } from "@/lib/facebook/dal";
import { createNotification } from "@/lib/notifications/create";
import { PENDING_PAGES_COOKIE } from "@/lib/facebook/constants";
import {
  fetchPageProfile,
  fetchPosts,
  fetchConversations,
  fetchConversationMessages,
  sendMessage,
  createPost,
  createPhotoPost,
  updatePost,
  deletePost,
  type FacebookPostPage,
  type FacebookConversation,
} from "@/lib/facebook/client";

const FACEBOOK_PATH = "/dashboard/facebook";

export async function disconnectFacebook(formData: FormData) {
  await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const supabase = await createClient();
  // RLS restricts this to admins; a non-admin's request simply deletes
  // nothing rather than erroring.
  await supabase.from("facebook_connections").delete().eq("organization_id", organizationId);

  revalidatePath(FACEBOOK_PATH);
}

// ---------------------------------------------------------------------------
// Multi-page selection — a user can administer more than one Facebook Page,
// so the OAuth callback stages the candidate list (minus access tokens,
// which never leave the server) in a short-lived cookie for this picker.
// ---------------------------------------------------------------------------

export interface PendingFacebookPage {
  id: string;
  name: string;
  pictureUrl: string | null;
}

export async function getPendingFacebookPages(): Promise<PendingFacebookPage[]> {
  await requireUser();
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_PAGES_COOKIE)?.value;
  if (!raw) return [];

  try {
    const pages = JSON.parse(raw) as { id: string; name: string; pictureUrl: string | null }[];
    return pages.map((p) => ({ id: p.id, name: p.name, pictureUrl: p.pictureUrl }));
  } catch {
    return [];
  }
}

export interface SelectPageState {
  error?: string;
  success?: boolean;
}

export async function selectFacebookPage(organizationId: string, pageId: string): Promise<SelectPageState> {
  const user = await requireUser();
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_PAGES_COOKIE)?.value;
  if (!raw) {
    return { error: "That selection expired. Please reconnect Facebook." };
  }

  let pages: { id: string; name: string; accessToken: string; pictureUrl: string | null }[];
  try {
    pages = JSON.parse(raw);
  } catch {
    return { error: "That selection expired. Please reconnect Facebook." };
  }

  const selected = pages.find((p) => p.id === pageId);
  if (!selected) {
    return { error: "That Page wasn't in your list. Please reconnect Facebook." };
  }

  try {
    const profile = await fetchPageProfile(selected.accessToken, selected.id);

    const supabase = await createClient();
    const { error } = await supabase.from("facebook_connections").upsert(
      {
        organization_id: organizationId,
        page_id: selected.id,
        page_name: profile.name,
        page_picture_url: profile.pictureUrl,
        fan_count: profile.fanCount,
        access_token: selected.accessToken,
        connected_by: user.id,
      },
      { onConflict: "organization_id" },
    );

    if (error) {
      return { error: "Couldn't save that connection. Please try again." };
    }

    cookieStore.delete(PENDING_PAGES_COOKIE);
    revalidatePath(FACEBOOK_PATH);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't connect that Page." };
  }
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function loadMoreFacebookPosts(organizationId: string, after?: string): Promise<FacebookPostPage> {
  await requireUser();
  const connection = await getFacebookConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  return fetchPosts(connection.access_token, connection.page_id, after);
}

export interface PostActionState {
  error?: string;
  success?: boolean;
  postId?: string;
}

export async function createFacebookPost(organizationId: string, message: string): Promise<PostActionState> {
  await requireUser();
  if (!message.trim()) {
    return { error: "Write something before posting." };
  }

  const connection = await getFacebookConnection(organizationId);
  if (!connection) {
    return { error: "Facebook isn't connected." };
  }

  try {
    const postId = await createPost(connection.access_token, connection.page_id, message.trim());
    await createNotification({
      organizationId,
      type: "facebook_post_created",
      title: "Facebook post published",
      body: message.trim().slice(0, 140),
      link: FACEBOOK_PATH,
    });
    return { success: true, postId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't publish that post." };
  }
}

export async function createFacebookPhotoPost(
  organizationId: string,
  message: string,
  formData: FormData,
): Promise<PostActionState> {
  await requireUser();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }

  const connection = await getFacebookConnection(organizationId);
  if (!connection) {
    return { error: "Facebook isn't connected." };
  }

  try {
    const bytes = await file.arrayBuffer();
    const postId = await createPhotoPost(connection.access_token, connection.page_id, message.trim(), bytes, file.type);
    await createNotification({
      organizationId,
      type: "facebook_post_created",
      title: "Facebook photo published",
      body: message.trim().slice(0, 140) || "A new photo was posted.",
      link: FACEBOOK_PATH,
    });
    return { success: true, postId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't publish that photo." };
  }
}

export async function updateFacebookPost(
  organizationId: string,
  postId: string,
  message: string,
): Promise<PostActionState> {
  await requireUser();
  if (!message.trim()) {
    return { error: "Message can't be empty." };
  }

  const connection = await getFacebookConnection(organizationId);
  if (!connection) {
    return { error: "Facebook isn't connected." };
  }

  try {
    await updatePost(connection.access_token, postId, message.trim());
    await createNotification({
      organizationId,
      type: "facebook_post_updated",
      title: "Facebook post updated",
      body: message.trim().slice(0, 140),
      link: FACEBOOK_PATH,
    });
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update that post." };
  }
}

export interface DeletePostState {
  error?: string;
  success?: boolean;
}

export async function deleteFacebookPost(organizationId: string, postId: string): Promise<DeletePostState> {
  await requireUser();
  const connection = await getFacebookConnection(organizationId);
  if (!connection) return { error: "Facebook isn't connected." };

  try {
    await deletePost(connection.access_token, postId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete that post." };
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function loadMoreFacebookConversations(
  organizationId: string,
  after?: string,
): Promise<{ items: FacebookConversation[]; nextCursor: string | null }> {
  await requireUser();
  const connection = await getFacebookConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  return fetchConversations(connection.access_token, connection.page_id, after);
}

export async function getFacebookConversationMessages(organizationId: string, conversationId: string) {
  await requireUser();
  const connection = await getFacebookConnection(organizationId);
  if (!connection) return [];

  return fetchConversationMessages(connection.access_token, conversationId);
}

export interface ReplyState {
  error?: string;
  success?: boolean;
}

export async function sendFacebookReply(
  organizationId: string,
  recipientId: string,
  text: string,
): Promise<ReplyState> {
  await requireUser();
  if (!text.trim()) {
    return { error: "Message can't be empty." };
  }

  const connection = await getFacebookConnection(organizationId);
  if (!connection) {
    return { error: "Facebook isn't connected." };
  }

  try {
    await sendMessage(connection.access_token, recipientId, text.trim());
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that message." };
  }
}

