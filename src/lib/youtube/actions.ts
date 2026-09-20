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
  createLiveStream,
  createLiveBroadcast,
  bindBroadcastToStream,
  transitionBroadcast,
  deleteBroadcast,
  findActiveManagedBroadcast,
  getStreamKey,
  fetchVideoDetails,
  updateVideoDetails,
  deleteVideo,
  initiateResumableUpload,
  setVideoThumbnail,
  type YouTubeVideoPage,
  type YouTubeCommentPage,
  type YouTubeManagedBroadcast,
  type YouTubeStreamKey,
  type YouTubePrivacyStatus,
  type YouTubeVideoDetails,
  type UploadVideoInput,
} from "@/lib/youtube/client";
import { ALLOWED_THUMBNAIL_TYPES, MAX_THUMBNAIL_BYTES } from "@/lib/youtube/validation";
import { createNotification } from "@/lib/notifications/create";

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

// pageToken omitted refetches page 1 — used both for "Load more" and for
// refreshing the list after an upload (a new video isn't guaranteed to be
// indexed into the uploads playlist instantly, so this may need a retry).
export async function loadMoreYouTubeVideos(organizationId: string, pageToken?: string): Promise<YouTubeVideoPage> {
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

// ---------------------------------------------------------------------------
// Live broadcast management
//
// The app manages the broadcast's lifecycle and hands back a stream key;
// actually capturing/encoding camera and mic still happens in dedicated
// streaming software (OBS, Streamlabs, a phone app) pointed at that key —
// browsers can't push RTMP, which is what YouTube's ingestion requires.
// ---------------------------------------------------------------------------

export interface YouTubeLiveStatus {
  broadcast: YouTubeManagedBroadcast | null;
  streamKey: YouTubeStreamKey | null;
}

export async function getYouTubeLiveStatus(organizationId: string): Promise<YouTubeLiveStatus> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { broadcast: null, streamKey: null };

  const accessToken = await getValidAccessToken(connection);
  const broadcast = await findActiveManagedBroadcast(accessToken);
  if (!broadcast?.streamId) {
    return { broadcast, streamKey: null };
  }

  const streamKey = await getStreamKey(accessToken, broadcast.streamId);
  return { broadcast, streamKey };
}

export interface StartBroadcastState {
  error?: string;
  broadcast?: YouTubeManagedBroadcast;
  streamKey?: YouTubeStreamKey;
}

export async function startYouTubeBroadcast(
  organizationId: string,
  input: { title: string; description: string; privacyStatus: YouTubePrivacyStatus },
): Promise<StartBroadcastState> {
  await requireUser();
  if (!input.title.trim()) {
    return { error: "Give the stream a title." };
  }

  const connection = await getYouTubeConnection(organizationId);
  if (!connection) {
    return { error: "YouTube isn't connected." };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const streamKey = await createLiveStream(accessToken, input.title.trim());
    const broadcast = await createLiveBroadcast(accessToken, {
      title: input.title.trim(),
      description: input.description.trim(),
      privacyStatus: input.privacyStatus,
    });
    await bindBroadcastToStream(accessToken, broadcast.id, streamKey.streamId);

    return { broadcast: { ...broadcast, streamId: streamKey.streamId }, streamKey };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the livestream." };
  }
}

export interface BroadcastActionState {
  error?: string;
  broadcast?: YouTubeManagedBroadcast;
}

export async function goLiveYouTubeBroadcast(
  organizationId: string,
  broadcastId: string,
): Promise<BroadcastActionState> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { error: "YouTube isn't connected." };

  try {
    const accessToken = await getValidAccessToken(connection);
    const broadcast = await transitionBroadcast(accessToken, broadcastId, "live");
    await createNotification({
      organizationId,
      type: "youtube_live_started",
      title: "Live stream started",
      body: `"${broadcast.title}" is now live on YouTube.`,
      link: "/dashboard/youtube",
    });
    return { broadcast };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Couldn't go live. Make sure your streaming software is already sending video to the stream key.",
    };
  }
}

export async function endYouTubeBroadcast(
  organizationId: string,
  broadcastId: string,
): Promise<BroadcastActionState> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { error: "YouTube isn't connected." };

  try {
    const accessToken = await getValidAccessToken(connection);
    const broadcast = await transitionBroadcast(accessToken, broadcastId, "complete");
    return { broadcast };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't end the stream." };
  }
}

export interface CancelBroadcastState {
  error?: string;
  success?: boolean;
}

export async function cancelYouTubeBroadcast(
  organizationId: string,
  broadcastId: string,
): Promise<CancelBroadcastState> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { error: "YouTube isn't connected." };

  try {
    const accessToken = await getValidAccessToken(connection);
    await deleteBroadcast(accessToken, broadcastId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't cancel the broadcast." };
  }
}

// ---------------------------------------------------------------------------
// Video management
// ---------------------------------------------------------------------------

export async function getYouTubeVideoDetails(
  organizationId: string,
  videoId: string,
): Promise<YouTubeVideoDetails | null> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return null;

  const accessToken = await getValidAccessToken(connection);
  return fetchVideoDetails(accessToken, videoId);
}

export interface UpdateVideoState {
  error?: string;
  success?: boolean;
}

export async function updateYouTubeVideo(
  organizationId: string,
  input: { id: string; title: string; description: string; categoryId: string; privacyStatus: YouTubePrivacyStatus },
): Promise<UpdateVideoState> {
  await requireUser();
  if (!input.title.trim()) {
    return { error: "Title can't be empty." };
  }

  const connection = await getYouTubeConnection(organizationId);
  if (!connection) {
    return { error: "YouTube isn't connected." };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    await updateVideoDetails(accessToken, input);
    await createNotification({
      organizationId,
      type: "youtube_video_updated",
      title: "Video updated",
      body: `"${input.title}" was updated on YouTube.`,
      link: "/dashboard/youtube",
    });
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update the video." };
  }
}

export interface DeleteVideoState {
  error?: string;
  success?: boolean;
}

export async function deleteYouTubeVideo(organizationId: string, videoId: string): Promise<DeleteVideoState> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return { error: "YouTube isn't connected." };

  try {
    const accessToken = await getValidAccessToken(connection);
    await deleteVideo(accessToken, videoId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete the video." };
  }
}

export interface StartUploadState {
  error?: string;
  uploadUrl?: string;
}

// Returns Google's pre-authorized upload session URL, not the access token
// itself — the browser PUTs the file directly to that URL (see
// YouTubeManager's uploadFileToSession), never routing the video bytes
// through our own server.
export async function startYouTubeUpload(
  organizationId: string,
  input: UploadVideoInput,
): Promise<StartUploadState> {
  await requireUser();
  if (!input.title.trim()) {
    return { error: "Give the video a title." };
  }

  const connection = await getYouTubeConnection(organizationId);
  if (!connection) {
    return { error: "YouTube isn't connected." };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const uploadUrl = await initiateResumableUpload(accessToken, input);
    return { uploadUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the upload." };
  }
}

export interface UpdateThumbnailState {
  error?: string;
  success?: boolean;
}

export async function updateYouTubeThumbnail(
  organizationId: string,
  videoId: string,
  formData: FormData,
): Promise<UpdateThumbnailState> {
  await requireUser();

  const file = formData.get("thumbnail");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!ALLOWED_THUMBNAIL_TYPES.includes(file.type)) {
    return { error: "Thumbnail must be a JPEG, PNG, GIF, or BMP image." };
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return { error: `Thumbnail must be smaller than ${Math.round(MAX_THUMBNAIL_BYTES / (1024 * 1024))}MB.` };
  }

  const connection = await getYouTubeConnection(organizationId);
  if (!connection) {
    return { error: "YouTube isn't connected." };
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const bytes = await file.arrayBuffer();
    await setVideoThumbnail(accessToken, videoId, bytes, file.type);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't update the thumbnail." };
  }
}

// The upload itself goes straight from the browser to Google (see
// startYouTubeUpload) — our server never sees it complete, so the client
// calls this explicitly once the direct upload succeeds.
export async function notifyYouTubeVideoUploaded(organizationId: string, title: string): Promise<void> {
  await requireUser();
  const connection = await getYouTubeConnection(organizationId);
  if (!connection) return;

  await createNotification({
    organizationId,
    type: "youtube_video_uploaded",
    title: "Video uploaded",
    body: `"${title}" was uploaded to YouTube.`,
    link: "/dashboard/youtube",
  });
}
