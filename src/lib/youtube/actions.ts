"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { getYouTubeConnection } from "@/lib/youtube/dal";
import { getValidAccessToken } from "@/lib/youtube/token";
import {
  fetchVideos,
  fetchCommentThreads,
  replyToComment,
  type YouTubeVideoPage,
  type YouTubeCommentPage,
} from "@/lib/youtube/client";

const YOUTUBE_PATH = "/dashboard/youtube";

export async function disconnectYouTube(formData: FormData) {
  await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const supabase = await createClient();
  // RLS restricts this to admins; a non-admin's request simply deletes
  // nothing rather than erroring.
  await supabase.from("youtube_connections").delete().eq("organization_id", organizationId);

  revalidatePath(YOUTUBE_PATH);
}

export async function loadMoreYouTubeVideos(organizationId: string, pageToken: string): Promise<YouTubeVideoPage> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  const accessToken = await getValidAccessToken(connection);
  return fetchVideos(accessToken, `UU${connection.channel_id.slice(2)}`, pageToken);
}

export async function loadMoreYouTubeComments(
  organizationId: string,
  pageToken: string,
): Promise<YouTubeCommentPage> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { items: [], nextCursor: null };

  const accessToken = await getValidAccessToken(connection);
  return fetchCommentThreads(accessToken, connection.channel_id, pageToken);
}

export interface ReplyState {
  error?: string;
  success?: boolean;
}

export async function replyToYouTubeComment(
  organizationId: string,
  parentCommentId: string,
  text: string,
): Promise<ReplyState> {
  await requireUser();
  if (!text.trim()) {
    return { error: "Reply can't be empty." };
  }

  const connection = await getYouTubeConnection(organizationId);
  if (!connection) {
    return { error: "YouTube isn't connected." };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    await replyToComment(accessToken, parentCommentId, text.trim());
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't post that reply." };
  }
}
