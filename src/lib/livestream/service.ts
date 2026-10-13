import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { getPlanLimits } from "@/lib/plans/dal";
import { maxDurationMinutesForMode } from "@/lib/kmeet/join";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds } from "@/lib/push/audience";
import { startHls, startRtmp, stopHls, stopRtmp } from "@/lib/livestream/videosdk";
import { VIEWER_WINDOW_SECONDS, type StreamSettings } from "@/lib/livestream/validation";
import type { LiveStream, LiveStreamOutput } from "@/types/database";

// Makes the K-Connect room a stream is broadcast from, and the stream itself.
export async function createLiveStream(input: { organizationId: string; userId: string; title: string; description: string | null; settings: StreamSettings; outputs: LiveStreamOutput[] }): Promise<{ id: string; meetingId: string } | { error: string }> {
  if (!isVideoSdkConfigured()) return { error: "Video isn't configured yet. Ask your developer to set it up." };
  const admin = createAdminClient();

  let roomId: string;
  try {
    roomId = await createVideoSdkRoom();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the room." };
  }

  const plan = await getPlanLimits(input.organizationId);
  const now = new Date().toISOString();
  // The room is moderated: only the team can step in; viewers watch the broadcast, not the room.
  const { data: meeting, error } = await admin
    .from("kmeet_meetings")
    .insert({
      organization_id: input.organizationId,
      title: input.title,
      description: input.description,
      room_id: roomId,
      status: "live",
      require_admission: true,
      started_at: now,
      last_active_at: now,
      max_duration_minutes: maxDurationMinutesForMode("video", plan),
      mode: "video",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !meeting) return { error: "Couldn't set up the room. Please try again." };

  const { data: stream, error: streamError } = await admin
    .from("live_streams")
    .insert({ organization_id: input.organizationId, meeting_id: meeting.id, title: input.title, description: input.description, rtmp_outputs: input.outputs, created_by: input.userId, ...input.settings })
    .select("id")
    .single();
  if (streamError || !stream) {
    await admin.from("kmeet_meetings").delete().eq("id", meeting.id);
    return { error: "Couldn't save the live stream. Please try again." };
  }
  return { id: stream.id, meetingId: meeting.id };
}

async function loadStream(organizationId: string, streamId: string) {
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("*").eq("id", streamId).eq("organization_id", organizationId).maybeSingle();
  if (!stream) return null;
  const { data: meeting } = await admin.from("kmeet_meetings").select("room_id, status").eq("id", stream.meeting_id).maybeSingle();
  return { stream: stream as LiveStream, roomId: meeting?.room_id ?? null, meetingStatus: meeting?.status ?? "ended" };
}

// Starts the broadcast (and the restream, if set up) and tells members.
export async function goLive(organizationId: string, streamId: string): Promise<{ error?: string; warning?: string }> {
  const loaded = await loadStream(organizationId, streamId);
  if (!loaded) return { error: "That live stream could not be found." };
  const { stream, roomId, meetingStatus } = loaded;
  if (stream.status === "live") return {};
  if (stream.status === "ended" || meetingStatus === "ended" || !roomId) return { error: "This stream has ended. Start a new one." };

  const hls = await startHls(roomId, stream);
  if ("error" in hls) {
    return { error: `Couldn't go live: ${hls.error}. Make sure you have joined the room with your camera or mic on, then try again.` };
  }

  let warning: string | undefined;
  if (stream.rtmp_outputs.length > 0) {
    const rtmp = await startRtmp(roomId, stream.rtmp_outputs, stream);
    if (rtmp.error) warning = `You're live in the app, but sending to ${stream.rtmp_outputs.map((o) => o.name).join(", ")} failed: ${rtmp.error}`;
  }

  const admin = createAdminClient();
  await admin.from("live_streams").update({ status: "live", playback_url: hls.playbackUrl, started_at: new Date().toISOString(), ended_at: null }).eq("id", streamId);

  if (stream.notify_members) {
    try {
      const recipients = await resolveAudienceAuthIds(organizationId, { type: "church" });
      await sendPushToUsers(recipients, "church_announcement", {
        title: `${stream.title} is live`,
        body: "Tap to watch the live stream now.",
        data: { type: "live_stream", streamId },
      });
    } catch {
      // Notifying is best-effort; the stream is live either way.
    }
  }
  return { warning };
}

// Stops the broadcast and the restream and marks the stream ended.
export async function endLiveStream(organizationId: string, streamId: string): Promise<void> {
  const loaded = await loadStream(organizationId, streamId);
  if (!loaded || loaded.stream.status === "ended") return;
  if (loaded.roomId && loaded.stream.status === "live") {
    await Promise.allSettled([stopHls(loaded.roomId), loaded.stream.rtmp_outputs.length > 0 ? stopRtmp(loaded.roomId) : Promise.resolve()]);
  }
  await createAdminClient().from("live_streams").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", streamId);
}

// Called when K-Connect rooms end (by the host or for being empty): their streams end too.
export async function endStreamsForMeetings(meetings: { id: string; room_id: string | null }[]): Promise<void> {
  if (meetings.length === 0) return;
  const admin = createAdminClient();
  const { data: streams } = await admin.from("live_streams").select("id, meeting_id, status, rtmp_outputs").in("meeting_id", meetings.map((m) => m.id)).neq("status", "ended");
  for (const stream of streams ?? []) {
    const room = meetings.find((m) => m.id === stream.meeting_id)?.room_id;
    if (room && stream.status === "live") {
      await Promise.allSettled([stopHls(room), (stream.rtmp_outputs as LiveStreamOutput[]).length > 0 ? stopRtmp(room) : Promise.resolve()]);
    }
    await admin.from("live_streams").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", stream.id);
  }
}

// Notes that a viewer is watching and returns how many are right now.
export async function reportViewer(streamId: string, viewerId: string): Promise<number> {
  const admin = createAdminClient();
  await admin.from("live_stream_viewers").upsert({ stream_id: streamId, viewer_id: viewerId, last_seen: new Date().toISOString() });
  const count = await countViewers(streamId);
  const { data: stream } = await admin.from("live_streams").select("peak_viewers").eq("id", streamId).maybeSingle();
  if (stream && count > stream.peak_viewers) await admin.from("live_streams").update({ peak_viewers: count }).eq("id", streamId);
  return count;
}

export async function countViewers(streamId: string): Promise<number> {
  const since = new Date(Date.now() - VIEWER_WINDOW_SECONDS * 1000).toISOString();
  const { count } = await createAdminClient().from("live_stream_viewers").select("viewer_id", { count: "exact", head: true }).eq("stream_id", streamId).gt("last_seen", since);
  return count ?? 0;
}
