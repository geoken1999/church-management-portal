"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanOutputs, cleanSettings } from "@/lib/livestream/validation";
import { createLiveStream, endLiveStream, goLive, countViewers } from "@/lib/livestream/service";
import { roomRecordings } from "@/lib/livestream/videosdk";
import { endStreamsForMeetings } from "@/lib/livestream/service";
import type { LiveStreamMessage } from "@/types/database";

const PATH = "/dashboard/livestream";

export interface StreamResult {
  error?: string;
  id?: string;
  meetingId?: string;
  warning?: string;
}

export async function createLiveStreamAction(input: { title: string; description: string; outputs: unknown; settings: Record<string, unknown> }): Promise<StreamResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "write");
  if (!access.ok) return { error: access.message };

  const title = input.title.trim().slice(0, 100);
  if (!title) return { error: "Give the live stream a title." };
  const outputs = cleanOutputs(input.outputs);
  if ("error" in outputs) return { error: outputs.error };

  const created = await createLiveStream({
    organizationId,
    userId: user.id,
    title,
    description: input.description.trim().slice(0, 500) || null,
    settings: cleanSettings(input.settings),
    outputs,
  });
  if ("error" in created) return { error: created.error };
  revalidatePath(PATH);
  return { id: created.id, meetingId: created.meetingId };
}

export async function goLiveAction(streamId: string): Promise<StreamResult> {
  await requireUser();
  const membership = await requireOrganization();
  const access = await checkTabAccess(membership.organization.id, "livestream", "write");
  if (!access.ok) return { error: access.message };
  const result = await goLive(membership.organization.id, streamId);
  revalidatePath(PATH);
  return result;
}

export async function endLiveStreamAction(streamId: string): Promise<StreamResult> {
  await requireUser();
  const membership = await requireOrganization();
  const access = await checkTabAccess(membership.organization.id, "livestream", "write");
  if (!access.ok) return { error: access.message };
  await endLiveStream(membership.organization.id, streamId);
  revalidatePath(PATH);
  return {};
}

// Ends the stream and the room it was broadcast from.
export async function endStreamAndRoomAction(streamId: string): Promise<StreamResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "write");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("meeting_id").eq("id", streamId).eq("organization_id", organizationId).maybeSingle();
  if (!stream) return { error: "That live stream could not be found." };
  await endLiveStream(organizationId, streamId);
  const { data: meeting } = await admin.from("kmeet_meetings").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", stream.meeting_id).select("id, room_id").maybeSingle();
  if (meeting) await endStreamsForMeetings([meeting]);
  revalidatePath(PATH);
  return {};
}

export async function deleteLiveStreamAction(streamId: string): Promise<StreamResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "delete");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("status, meeting_id").eq("id", streamId).eq("organization_id", organizationId).maybeSingle();
  if (!stream) return {};
  if (stream.status === "live") return { error: "End the stream before deleting it." };
  await admin.from("live_streams").delete().eq("id", streamId);
  await admin.from("kmeet_meetings").delete().eq("id", stream.meeting_id).eq("organization_id", organizationId);
  revalidatePath(PATH);
  return {};
}

export interface LiveState {
  status?: "ready" | "live" | "ended";
  viewers?: number;
  peak?: number;
  messages?: LiveStreamMessage[];
  error?: string;
}

// The host's view of a stream: its status, how many are watching, and the latest chat.
export async function getLiveStateAction(streamId: string): Promise<LiveState> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "read");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("status, peak_viewers").eq("id", streamId).eq("organization_id", organizationId).maybeSingle();
  if (!stream) return { error: "That live stream could not be found." };
  const { data: messages } = await admin.from("live_stream_messages").select("*").eq("stream_id", streamId).order("created_at", { ascending: false }).limit(60);
  return { status: stream.status, viewers: await countViewers(streamId), peak: stream.peak_viewers, messages: (messages ?? []).reverse() };
}

export async function sendHostChatAction(streamId: string, body: string): Promise<StreamResult> {
  await requireUser();
  const [membership, profile] = await Promise.all([requireOrganization(), getProfile()]);
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "write");
  if (!access.ok) return { error: access.message };
  const text = body.trim().slice(0, 300);
  if (!text) return {};
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("id, chat_enabled").eq("id", streamId).eq("organization_id", organizationId).maybeSingle();
  if (!stream) return { error: "That live stream could not be found." };
  await admin.from("live_stream_messages").insert({ stream_id: streamId, organization_id: organizationId, author_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() || membership.organization.name : membership.organization.name, author_kind: "host", body: text });
  return {};
}

export async function getRecordingsAction(streamId: string): Promise<{ error?: string; recordings?: { url: string; start: string | null; end: string | null }[] }> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", "read");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("meeting_id, record").eq("id", streamId).eq("organization_id", organizationId).maybeSingle();
  if (!stream) return { error: "That live stream could not be found." };
  if (!stream.record) return { error: "Recording was not turned on for this stream." };
  const { data: meeting } = await admin.from("kmeet_meetings").select("room_id").eq("id", stream.meeting_id).maybeSingle();
  if (!meeting?.room_id) return { recordings: [] };
  return { recordings: await roomRecordings(meeting.room_id) };
}
