import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateParticipantToken } from "@/lib/kmeet/token";
import { participantPermissionsFor, resolveMeetingRoom } from "@/lib/kmeet/join";
import { cancelEntry, entryStatus, requestEntry } from "@/lib/kmeet/entry";

// A guest joining a K-Connect call from the mobile app by invite link, with no
// account: the same rules as the public web invite page. A guest is never a host,
// and waits in the waiting room when the call admits people one by one. The app
// makes up a random key for the guest (so one guest's request is told apart from
// another's).
const UUID = /^[0-9a-f-]{36}$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  const guestKey = typeof body.guestKey === "string" ? body.guestKey : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!UUID.test(meetingId) || !UUID.test(guestKey)) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  if (body.action === "status") return NextResponse.json({ ok: true, status: await entryStatus(meetingId, guestKey) });
  if (body.action === "cancel") {
    await cancelEntry(meetingId, guestKey);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "heartbeat") {
    const { data } = await createAdminClient().from("kmeet_meetings").update({ last_active_at: new Date().toISOString() }).eq("id", meetingId).eq("status", "live").select("id").maybeSingle();
    return NextResponse.json({ ok: true, ended: !data });
  }
  if (body.action !== "join") return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Enter your name to join." });

  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved) return NextResponse.json({ ok: false, error: resolved.error });

  if (resolved.requireAdmission) {
    const status = await requestEntry(meetingId, guestKey, name);
    if (status !== "allowed") return NextResponse.json({ ok: true, waiting: status });
  }
  return NextResponse.json({
    ok: true,
    roomId: resolved.roomId,
    token: generateParticipantToken(resolved.roomId, participantPermissionsFor(false, false)),
    displayName: name,
    isModerator: false,
    requireAdmission: resolved.requireAdmission,
    startedAt: resolved.startedAt,
    maxDurationMinutes: resolved.maxDurationMinutes,
    mode: resolved.mode,
  });
}
