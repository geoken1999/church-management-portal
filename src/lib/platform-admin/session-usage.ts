import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { roomUsage } from "@/lib/livestream/videosdk";

// What a live stream or call used, per session. Time in the room comes from the video
// service's own records; what viewers used is added up from their playback reports.
export interface SessionUsageRow {
  id: string;
  kind: "stream" | "call";
  title: string;
  organizationName: string;
  organizationId: string;
  mode: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  // How long the session ran (a broadcast runs as long as its room).
  durationSeconds: number;
  // Everyone's time in the room added together (broadcaster, co-hosts, guests).
  participantSeconds: number | null;
  // Streams only.
  peakViewers: number;
  viewerSeconds: number;
  estimatedEgressMb: number;
  quality: string | null;
  recorded: boolean;
  restreams: number;
  obs: boolean;
}

// Roughly what each quality sends a viewer, from the video service's own playlists (Mbps).
const VIEWER_MBPS = { low: 0.66, med: 1.79, high: 2.0, audio: 0.13 } as const;

export const estimateEgressMb = (viewerSeconds: number, quality: string | null, audioOnly: boolean) => {
  const mbps = audioOnly ? VIEWER_MBPS.audio : VIEWER_MBPS[(quality as "low" | "med" | "high") ?? "high"] ?? VIEWER_MBPS.high;
  return (viewerSeconds * mbps) / 8;
};

const MAX_LOOKUPS_PER_VIEW = 8;

export async function getSessionUsage(limit = 40): Promise<SessionUsageRow[]> {
  const admin = createAdminClient();
  const [{ data: streams }, { data: meetings }] = await Promise.all([
    admin.from("live_streams").select("id, organization_id, meeting_id, title, status, started_at, ended_at, created_at, peak_viewers, quality, audio_only, record, rtmp_outputs, ingest_active").order("created_at", { ascending: false }).limit(limit),
    admin.from("kmeet_meetings").select("id, organization_id, title, mode, status, started_at, ended_at, room_id, participant_seconds, usage_checked_at").not("started_at", "is", null).order("started_at", { ascending: false }).limit(limit * 2),
  ]);

  const streamMeetingIds = new Set((streams ?? []).map((s) => s.meeting_id));
  // The streams' own rooms may be older than the newest calls; fetch them when missing.
  const missing = [...streamMeetingIds].filter((id) => !(meetings ?? []).some((m) => m.id === id));
  const { data: extra } = missing.length ? await admin.from("kmeet_meetings").select("id, organization_id, title, mode, status, started_at, ended_at, room_id, participant_seconds, usage_checked_at").in("id", missing) : { data: [] };
  const rooms = new Map([...(meetings ?? []), ...(extra ?? [])].map((m) => [m.id, m]));

  // Time in the room is asked of the video service for sessions we haven't yet (a running one each time).
  let lookups = 0;
  for (const room of rooms.values()) {
    if (lookups >= MAX_LOOKUPS_PER_VIEW) break;
    const running = room.status !== "ended";
    if (!room.room_id || (!running && room.usage_checked_at)) continue;
    lookups++;
    const usage = await roomUsage(room.room_id);
    if (!usage) continue;
    room.participant_seconds = usage.participantSeconds;
    if (!running) {
      room.usage_checked_at = new Date().toISOString();
      await admin.from("kmeet_meetings").update({ participant_seconds: usage.participantSeconds, usage_checked_at: room.usage_checked_at }).eq("id", room.id);
    }
  }

  const streamIds = (streams ?? []).map((s) => s.id);
  const { data: viewers } = streamIds.length ? await admin.from("live_stream_viewers").select("stream_id, watch_seconds").in("stream_id", streamIds).limit(50000) : { data: [] };
  const viewerSeconds = new Map<string, number>();
  for (const v of viewers ?? []) viewerSeconds.set(v.stream_id, (viewerSeconds.get(v.stream_id) ?? 0) + v.watch_seconds);

  const orgIds = [...new Set([...(streams ?? []).map((s) => s.organization_id), ...[...rooms.values()].map((m) => m.organization_id)])];
  const { data: orgs } = orgIds.length ? await admin.from("organizations").select("id, name").in("id", orgIds) : { data: [] };
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const now = Date.now();
  const seconds = (start: string | null, end: string | null) => (start ? Math.max(0, Math.round(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000)) : 0);

  const rows: SessionUsageRow[] = [];
  for (const s of streams ?? []) {
    const room = rooms.get(s.meeting_id);
    const watched = viewerSeconds.get(s.id) ?? 0;
    rows.push({
      id: s.id,
      kind: "stream",
      title: s.title,
      organizationName: orgName.get(s.organization_id) ?? "Unknown church",
      organizationId: s.organization_id,
      mode: s.audio_only ? "Live audio" : "Live stream",
      status: s.status,
      startedAt: s.started_at ?? room?.started_at ?? null,
      endedAt: s.ended_at,
      durationSeconds: seconds(s.started_at, s.ended_at),
      participantSeconds: room?.participant_seconds ?? null,
      peakViewers: s.peak_viewers,
      viewerSeconds: watched,
      estimatedEgressMb: estimateEgressMb(watched, s.quality, s.audio_only),
      quality: s.quality,
      recorded: s.record,
      restreams: Array.isArray(s.rtmp_outputs) ? s.rtmp_outputs.length : 0,
      obs: s.ingest_active,
    });
  }
  for (const m of rooms.values()) {
    if (streamMeetingIds.has(m.id)) continue;
    rows.push({
      id: m.id,
      kind: "call",
      title: m.title,
      organizationName: orgName.get(m.organization_id) ?? "Unknown church",
      organizationId: m.organization_id,
      mode: m.mode === "audio" ? "Audio call" : "Video call",
      status: m.status,
      startedAt: m.started_at,
      endedAt: m.ended_at,
      durationSeconds: seconds(m.started_at, m.ended_at),
      participantSeconds: m.participant_seconds,
      peakViewers: 0,
      viewerSeconds: 0,
      estimatedEgressMb: 0,
      quality: null,
      recorded: false,
      restreams: 0,
      obs: false,
    });
  }
  return rows.sort((a, b) => Date.parse(b.startedAt ?? "0") - Date.parse(a.startedAt ?? "0")).slice(0, limit);
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatDataSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}
