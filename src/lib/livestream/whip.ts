import "server-only";

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LiveStream } from "@/types/database";

// The stream an OBS (WHIP) request is for, when its bearer token is that stream's key.
export async function streamForIngest(request: Request, streamId: string): Promise<{ stream: LiveStream; roomId: string } | { error: string; status: number }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Missing stream key.", status: 401 };

  if (!/^[0-9a-f-]{36}$/i.test(streamId)) return { error: "Unknown stream.", status: 404 };
  const admin = createAdminClient();
  const { data } = await admin.from("live_streams").select("*").eq("id", streamId).maybeSingle();
  const stream = data as LiveStream | null;

  // The same answer for a missing stream and a wrong key, so keys can't be probed.
  const a = Buffer.from(token);
  const b = Buffer.from(stream?.ingest_key ?? "x".repeat(64));
  const ok = stream !== null && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok || !stream) return { error: "Wrong stream key.", status: 401 };
  if (stream.status === "ended") return { error: "This stream has ended. Create a new one.", status: 409 };

  const { data: meeting } = await admin.from("kmeet_meetings").select("room_id, status").eq("id", stream.meeting_id).maybeSingle();
  if (!meeting?.room_id || meeting.status === "ended") return { error: "This stream's room has ended. Create a new one.", status: 409 };
  return { stream, roomId: meeting.room_id };
}
