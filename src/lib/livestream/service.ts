import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { getPlanLimits } from "@/lib/plans/dal";
import { maxDurationMinutesForMode } from "@/lib/kmeet/join";
import {
  isLiveStreamEnabled,
  LIVE_STREAM_NOT_ENABLED,
} from "@/lib/livestream/access";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds } from "@/lib/push/audience";
import {
  endRoomSession,
  startHls,
  startRtmp,
  stopHls,
  stopRtmp,
  whipEnd,
} from "@/lib/livestream/videosdk";
import {
  VIEWER_WINDOW_SECONDS,
  type StreamSettings,
} from "@/lib/livestream/validation";
import {
  assessHealth,
  type FeedReading,
  type StreamHealth,
  type ViewerReading,
} from "@/lib/livestream/health-assess";
import type { LiveStream, LiveStreamOutput } from "@/types/database";

// Makes the K-Connect room a stream is broadcast from, and the stream itself.
export async function createLiveStream(input: {
  organizationId: string;
  userId: string;
  title: string;
  description: string | null;
  settings: StreamSettings;
  outputs: LiveStreamOutput[];
}): Promise<{ id: string; meetingId: string } | { error: string }> {
  if (!(await isLiveStreamEnabled(input.organizationId)))
    return { error: LIVE_STREAM_NOT_ENABLED };
  if (!isVideoSdkConfigured())
    return {
      error: "Video isn't configured yet. Ask your developer to set it up.",
    };
  const admin = createAdminClient();

  let roomId: string;
  try {
    roomId = await createVideoSdkRoom();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Couldn't start the room.",
    };
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
  if (error || !meeting)
    return { error: "Couldn't set up the room. Please try again." };

  const { data: stream, error: streamError } = await admin
    .from("live_streams")
    .insert({
      organization_id: input.organizationId,
      meeting_id: meeting.id,
      title: input.title,
      description: input.description,
      rtmp_outputs: input.outputs,
      created_by: input.userId,
      ...input.settings,
    })
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
  const { data: stream } = await admin
    .from("live_streams")
    .select("*")
    .eq("id", streamId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!stream) return null;
  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("room_id, status")
    .eq("id", stream.meeting_id)
    .maybeSingle();
  return {
    stream: stream as LiveStream,
    roomId: meeting?.room_id ?? null,
    meetingStatus: meeting?.status ?? "ended",
  };
}

// Starts the broadcast (and the restream, if set up) and tells members.
export async function goLive(
  organizationId: string,
  streamId: string,
): Promise<{ error?: string; warning?: string }> {
  const loaded = await loadStream(organizationId, streamId);
  if (!loaded) return { error: "That live stream could not be found." };
  const { stream, roomId, meetingStatus } = loaded;
  if (!(await isLiveStreamEnabled(organizationId)))
    return { error: LIVE_STREAM_NOT_ENABLED };
  if (stream.status === "live") return {};
  if (stream.status === "ended" || meetingStatus === "ended" || !roomId)
    return { error: "This stream has ended. Start a new one." };

  const hls = await startHls(roomId, stream);
  if ("error" in hls) {
    return {
      error: `Couldn't go live: ${hls.error}. Make sure the broadcast room has your camera or mic on, or that OBS is connected, then try again.`,
    };
  }

  let warning: string | undefined;
  if (stream.rtmp_outputs.length > 0) {
    const rtmp = await startRtmp(roomId, stream.rtmp_outputs, stream);
    if (rtmp.error)
      warning = `You're live in the app, but sending to ${stream.rtmp_outputs.map((o) => o.name).join(", ")} failed: ${rtmp.error}`;
  }

  const admin = createAdminClient();
  await admin
    .from("live_streams")
    .update({
      status: "live",
      playback_url: hls.playbackUrl,
      started_at: new Date().toISOString(),
      ended_at: null,
    })
    .eq("id", streamId);

  if (stream.notify_members) {
    try {
      const recipients = await resolveAudienceAuthIds(organizationId, {
        type: "church",
      });
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
export async function endLiveStream(
  organizationId: string,
  streamId: string,
): Promise<void> {
  const loaded = await loadStream(organizationId, streamId);
  if (!loaded || loaded.stream.status === "ended") return;
  if (loaded.roomId && loaded.stream.status === "live") {
    await Promise.allSettled([
      stopHls(loaded.roomId),
      loaded.stream.rtmp_outputs.length > 0
        ? stopRtmp(loaded.roomId)
        : Promise.resolve(),
    ]);
  }
  if (loaded.stream.ingest_session) await whipEnd(loaded.stream.ingest_session);
  await createAdminClient()
    .from("live_streams")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      ingest_active: false,
      ingest_session: null,
    })
    .eq("id", streamId);
}

// Called when K-Connect rooms end (by the host or for being empty): their streams end too.
export async function endStreamsForMeetings(
  meetings: { id: string; room_id: string | null }[],
): Promise<void> {
  if (meetings.length === 0) return;
  // Whatever ended them, the rooms are closed at the video service too, so no one stays connected.
  await Promise.allSettled(
    meetings
      .filter((m) => m.room_id)
      .map((m) => endRoomSession(m.room_id as string)),
  );
  const admin = createAdminClient();
  const { data: streams } = await admin
    .from("live_streams")
    .select("id, meeting_id, status, rtmp_outputs, ingest_session")
    .in(
      "meeting_id",
      meetings.map((m) => m.id),
    )
    .neq("status", "ended");
  for (const stream of streams ?? []) {
    const room = meetings.find((m) => m.id === stream.meeting_id)?.room_id;
    if (room && stream.status === "live") {
      await Promise.allSettled([
        stopHls(room),
        (stream.rtmp_outputs as LiveStreamOutput[]).length > 0
          ? stopRtmp(room)
          : Promise.resolve(),
      ]);
    }
    if (stream.ingest_session) await whipEnd(stream.ingest_session);
    await admin
      .from("live_streams")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        ingest_active: false,
        ingest_session: null,
      })
      .eq("id", stream.id);
  }
}

export interface ViewerMetrics {
  rttMs?: number | null;
  bufferedMs?: number | null;
  stalls?: number | null;
  buffering?: boolean;
  resolution?: string | null;
}

const clampInt = (value: number | null | undefined, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value)))
    : null;

// Notes that a viewer is watching (and how their playback is going) and returns how many are
// watching right now. Watch time adds up from one report to the next, so a viewer who leaves
// and comes back is still counted for the time they were really there.
//
// Viewers report every few seconds, so this is the busiest call on the stream. The count comes back
// after two quick reads (this viewer's last report, and how many others are watching, which with
// the viewer themselves is the whole audience); the saving is returned as `save` for the caller to
// run after the reply has gone out, so the viewer never waits for it.
export async function reportViewer(
  streamId: string,
  viewerId: string,
  metrics: ViewerMetrics = {},
  currentPeak = 0,
): Promise<{ count: number; save: () => Promise<void> }> {
  const admin = createAdminClient();
  const now = new Date();
  const since = new Date(
    now.getTime() - VIEWER_WINDOW_SECONDS * 1000,
  ).toISOString();
  const [{ data: existing }, { count: others }] = await Promise.all([
    admin
      .from("live_stream_viewers")
      .select("last_seen, watch_seconds, first_seen_at")
      .eq("stream_id", streamId)
      .eq("viewer_id", viewerId)
      .maybeSingle(),
    admin
      .from("live_stream_viewers")
      .select("viewer_id", { count: "exact", head: true })
      .eq("stream_id", streamId)
      .neq("viewer_id", viewerId)
      .gt("last_seen", since),
  ]);
  const count = (others ?? 0) + 1;
  // Reports come every few seconds; a longer gap means they were away, so only a short gap counts.
  const gap = existing
    ? (now.getTime() - new Date(existing.last_seen).getTime()) / 1000
    : 0;
  const added = gap > 0 && gap <= 15 ? Math.round(gap) : 0;

  const save = async () => {
    try {
      await admin.from("live_stream_viewers").upsert({
        stream_id: streamId,
        viewer_id: viewerId,
        last_seen: now.toISOString(),
        first_seen_at: existing?.first_seen_at ?? now.toISOString(),
        watch_seconds: (existing?.watch_seconds ?? 0) + added,
        rtt_ms: clampInt(metrics.rttMs, 60_000),
        buffered_ms: clampInt(metrics.bufferedMs, 600_000),
        stalls: clampInt(metrics.stalls, 100_000) ?? 0,
        buffering: metrics.buffering === true,
        resolution:
          typeof metrics.resolution === "string"
            ? metrics.resolution.slice(0, 16)
            : null,
      });
      if (count > currentPeak)
        await admin
          .from("live_streams")
          .update({ peak_viewers: count })
          .eq("id", streamId)
          .lt("peak_viewers", count);
    } catch (err) {
      console.error("reportViewer save failed:", err);
    }
  };
  return { count, save };
}

export async function countViewers(streamId: string): Promise<number> {
  const since = new Date(
    Date.now() - VIEWER_WINDOW_SECONDS * 1000,
  ).toISOString();
  const { count } = await createAdminClient()
    .from("live_stream_viewers")
    .select("viewer_id", { count: "exact", head: true })
    .eq("stream_id", streamId)
    .gt("last_seen", since);
  return count ?? 0;
}

// --- Health ----------------------------------------------------------------

const feedMemo = new Map<string, { at: number; value: FeedReading }>();

// Looks at the stream's own playlist: is the video service still adding video to it, and how fresh is it?
async function readFeed(playbackUrl: string | null): Promise<FeedReading> {
  if (!playbackUrl)
    return { reachable: false, ageSeconds: null, targetSeconds: null };
  const cached = feedMemo.get(playbackUrl);
  if (cached && Date.now() - cached.at < 3000) return cached.value;
  let value: FeedReading = {
    reachable: false,
    ageSeconds: null,
    targetSeconds: null,
  };
  try {
    const master = await fetch(playbackUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (master.ok) {
      const text = await master.text();
      const lines = text.split("\n").map((l) => l.trim());
      const variant = lines.find(
        (l, i) =>
          i > 0 &&
          lines[i - 1].startsWith("#EXT-X-STREAM-INF") &&
          l &&
          !l.startsWith("#"),
      );
      const mediaUrl = variant
        ? new URL(variant, playbackUrl).toString()
        : playbackUrl;
      const media = await fetch(mediaUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (media.ok) {
        const body = await media.text();
        const target =
          Number(/#EXT-X-TARGETDURATION:(\d+)/.exec(body)?.[1] ?? "") || null;
        const modified = media.headers.get("last-modified");
        const age = modified
          ? Math.max(0, (Date.now() - Date.parse(modified)) / 1000)
          : null;
        value = {
          reachable: true,
          ageSeconds:
            age === null || Number.isNaN(age)
              ? null
              : Math.round(age * 10) / 10,
          targetSeconds: target,
        };
      }
    }
  } catch {
    // Unreachable: reported as such.
  }
  feedMemo.set(playbackUrl, { at: Date.now(), value });
  return value;
}

export async function getStreamHealth(
  streamId: string,
): Promise<StreamHealth | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("live_streams")
    .select("status, playback_url, ingest_active")
    .eq("id", streamId)
    .maybeSingle();
  if (!data) return null;
  const since = new Date(
    Date.now() - VIEWER_WINDOW_SECONDS * 1000,
  ).toISOString();
  const { data: rows } = await admin
    .from("live_stream_viewers")
    .select("rtt_ms, buffered_ms, stalls, buffering")
    .eq("stream_id", streamId)
    .gt("last_seen", since);
  const list = rows ?? [];
  const avg = (values: (number | null)[]) => {
    const real = values.filter((v): v is number => typeof v === "number");
    return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
  };
  const viewers: ViewerReading = {
    count: list.length,
    bufferingCount: list.filter((r) => r.buffering).length,
    avgRttMs: avg(list.map((r) => r.rtt_ms)),
    avgBufferedMs: avg(list.map((r) => r.buffered_ms)),
    stalls: list.reduce((sum, r) => sum + (r.stalls ?? 0), 0),
  };
  const live = data.status === "live";
  const feed = live
    ? await readFeed(data.playback_url)
    : { reachable: false, ageSeconds: null, targetSeconds: null };
  return assessHealth({
    live,
    ingestActive: data.ingest_active,
    feed,
    viewers,
  });
}
