import "server-only";

import { generateServerToken } from "@/lib/kmeet/token";
import type { LiveStream } from "@/types/database";

const API = "https://api.videosdk.live/v2";

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: { Authorization: generateServerToken(), "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json: json as Record<string, unknown> | null, text };
}

const reason = (r: { json: Record<string, unknown> | null; text: string; status: number }) => {
  const message = r.json && typeof r.json.error === "string" ? r.json.error : r.json && typeof r.json.message === "string" ? r.json.message : r.text.slice(0, 160);
  return message || `VideoSDK answered ${r.status}`;
};

// What the broadcast looks like, from the stream's saved settings.
function hlsConfig(stream: Pick<LiveStream, "layout" | "layout_priority" | "orientation" | "theme" | "quality" | "audio_only" | "record">) {
  return {
    layout: { type: stream.layout, priority: stream.layout_priority, gridSize: 4 },
    orientation: stream.orientation,
    theme: stream.theme,
    quality: stream.quality,
    mode: stream.audio_only ? "audio" : "video-and-audio",
    recording: { enabled: stream.record },
  };
}

// Starts the HLS broadcast of a room: the link members watch.
export async function startHls(roomId: string, stream: Parameters<typeof hlsConfig>[0]): Promise<{ playbackUrl: string | null } | { error: string }> {
  const r = await call("/hls/start", { method: "POST", body: { roomId, config: hlsConfig(stream) } });
  if (!r.ok) return { error: reason(r) };
  const url = r.json?.playbackHlsUrl ?? r.json?.downstreamUrl;
  return { playbackUrl: typeof url === "string" ? url : null };
}

export async function stopHls(roomId: string): Promise<void> {
  await call("/hls/end", { method: "POST", body: { roomId } });
}

// The playback link of the HLS currently running in a room, if VideoSDK has one yet.
export async function activeHlsUrl(roomId: string): Promise<string | null> {
  const r = await call(`/hls/${encodeURIComponent(roomId)}/active`, { method: "GET" });
  const data = r.json?.data as Record<string, unknown> | undefined;
  return r.ok && typeof data?.playbackHlsUrl === "string" ? data.playbackHlsUrl : null;
}

// Sends the room on to YouTube, Facebook etc. (RTMP out).
export async function startRtmp(roomId: string, outputs: { url: string; streamKey: string }[], stream: Parameters<typeof hlsConfig>[0]): Promise<{ error?: string }> {
  const r = await call("/livestreams/start", {
    method: "POST",
    body: {
      roomId,
      outputs: outputs.map((o) => ({ url: o.url, streamKey: o.streamKey })),
      config: { layout: { type: stream.layout, priority: stream.layout_priority, gridSize: 4 }, theme: stream.theme, recording: { enabled: false } },
    },
  });
  return r.ok ? {} : { error: reason(r) };
}

export async function stopRtmp(roomId: string): Promise<void> {
  await call("/livestreams/end", { method: "POST", body: { roomId } });
}

// Recordings of a room (when "record" was on), newest first.
export async function roomRecordings(roomId: string): Promise<{ url: string; start: string | null; end: string | null }[]> {
  const r = await call(`/recordings?roomId=${encodeURIComponent(roomId)}`, { method: "GET" });
  const list = (r.json?.data as unknown[] | undefined) ?? [];
  return list
    .map((item) => {
      const rec = item as { file?: { fileUrl?: string }; start?: string; end?: string };
      return rec.file?.fileUrl ? { url: rec.file.fileUrl, start: rec.start ?? null, end: rec.end ?? null } : null;
    })
    .filter((x): x is { url: string; start: string | null; end: string | null } => x !== null);
}

// OBS and other WHIP encoders: hands the encoder's offer to VideoSDK, which puts the
// encoder in the room as a participant. Returns the answer to give back to the encoder.
export async function whipOffer(roomId: string, participantId: string, sdpOffer: string): Promise<{ answer: string; sessionId: string | null } | { error: string; status: number }> {
  const res = await fetch(`${API}/whip?roomId=${encodeURIComponent(roomId)}&participantId=${encodeURIComponent(participantId)}`, {
    method: "POST",
    headers: { Authorization: generateServerToken(), "Content-Type": "application/sdp" },
    body: sdpOffer,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // Not JSON; the raw text will do.
    }
    return { error: message || `VideoSDK answered ${res.status}`, status: res.status };
  }
  const location = res.headers.get("location") ?? "";
  const sessionId = location.split("/").filter(Boolean).pop() ?? null;
  return { answer: text, sessionId };
}

export async function whipEnd(sessionId: string): Promise<void> {
  await fetch(`${API}/whip/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", headers: { Authorization: generateServerToken() } }).catch(() => {});
}

// How much a room was used: the time every participant spent in it, from the video service's
// own session records. Null when the service has nothing for the room (or can't be reached).
export async function roomUsage(roomId: string): Promise<{ participantSeconds: number; sessionSeconds: number; peakParticipants: number } | null> {
  const r = await call(`/sessions/?roomId=${encodeURIComponent(roomId)}&perPage=50`, { method: "GET" });
  const sessions = (r.json?.data as { start?: string; end?: string | null; participants?: { timelog?: { start?: string; end?: string | null }[] }[] }[] | undefined) ?? [];
  if (!r.ok) return null;
  const now = Date.now();
  let participantSeconds = 0;
  let sessionSeconds = 0;
  let peak = 0;
  for (const session of sessions) {
    const sessionStart = session.start ? Date.parse(session.start) : NaN;
    const sessionEnd = session.end ? Date.parse(session.end) : now;
    if (!Number.isNaN(sessionStart)) sessionSeconds += Math.max(0, (sessionEnd - sessionStart) / 1000);
    peak = Math.max(peak, session.participants?.length ?? 0);
    for (const person of session.participants ?? []) {
      for (const log of person.timelog ?? []) {
        const start = log.start ? Date.parse(log.start) : NaN;
        const end = log.end ? Date.parse(log.end) : sessionEnd;
        if (!Number.isNaN(start) && !Number.isNaN(end)) participantSeconds += Math.max(0, (end - start) / 1000);
      }
    }
  }
  return { participantSeconds: Math.round(participantSeconds), sessionSeconds: Math.round(sessionSeconds), peakParticipants: peak };
}

// Closes a room's running session at the video service, so nobody stays connected (and counted)
// after the church has ended it. Best effort: an already-empty room just says so.
export async function endRoomSession(roomId: string): Promise<void> {
  await call("/sessions/end", { method: "POST", body: { roomId } }).catch(() => {});
}
