import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prayerMemberFromRequest } from "@/lib/prayer/member-session";
import {
  PRAYER_AUDIO_BUCKET,
  prayerAudioPath,
  prayerAudioProblem,
} from "@/lib/prayer/audio";

// Step one of a voice prayer: the app says what it is about to upload (type and size) and gets a one-time
// upload link for a path the server chose inside the member's own folder. The recording then goes
// straight to storage; the prayer request that follows names that path.
export async function POST(request: Request) {
  const member = await prayerMemberFromRequest(request);
  if (!member)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );

  let body: { type?: unknown; size?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const type = typeof body.type === "string" ? body.type : "";
  const size = typeof body.size === "number" ? body.size : 0;
  const problem = prayerAudioProblem({ type, size });
  if (problem) return NextResponse.json({ ok: false, error: problem });

  const path = prayerAudioPath(
    member.organizationId,
    member.memberId,
    type,
    crypto.randomUUID(),
  );
  const { data, error } = await createAdminClient()
    .storage.from(PRAYER_AUDIO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data)
    return NextResponse.json(
      { ok: false, error: "Couldn't start the upload. Please try again." },
      { status: 500 },
    );
  return NextResponse.json({ ok: true, path, token: data.token });
}
