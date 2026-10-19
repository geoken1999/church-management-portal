import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prayerMemberFromRequest } from "@/lib/prayer/member-session";
import { PRAYER_AUDIO_BUCKET } from "@/lib/prayer/audio";

export const dynamic = "force-dynamic";

const LINK_SECONDS = 300;

// A short-lived link to play a prayer request's voice message. Allowed for the member who made it, and for
// other members of the same church when the request is shared on the prayer wall. The storage path is
// never sent to the app.
export async function GET(request: Request) {
  try {
    return await handlePlay(request);
  } catch (err) {
    console.error("mobile/prayer-requests/audio/route.ts GET failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

async function handlePlay(request: Request) {
  const member = await prayerMemberFromRequest(request);
  if (!member)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json(
      { ok: false, error: "That recording could not be found." },
      { status: 404 },
    );

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("prayer_requests")
    .select("organization_id, member_id, visibility, audio_path")
    .eq("id", id)
    .maybeSingle();
  const allowed =
    row?.audio_path &&
    row.organization_id === member.organizationId &&
    (row.member_id === member.memberId || row.visibility === "shared");
  if (!row || !row.audio_path || !allowed)
    return NextResponse.json(
      { ok: false, error: "That recording could not be found." },
      { status: 404 },
    );

  const { data, error } = await admin.storage
    .from(PRAYER_AUDIO_BUCKET)
    .createSignedUrl(row.audio_path, LINK_SECONDS);
  if (error || !data)
    return NextResponse.json(
      { ok: false, error: "Couldn't open that recording." },
      { status: 500 },
    );
  return NextResponse.json({
    ok: true,
    url: data.signedUrl,
    expiresInSeconds: LINK_SECONDS,
  });
}

// Removes one of the member's own requests together with its voice message file (a plain row delete
// from the app would leave the recording behind in storage).
export async function DELETE(request: Request) {
  try {
    return await handleRemove(request);
  } catch (err) {
    console.error("mobile/prayer-requests/audio/route.ts DELETE failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

async function handleRemove(request: Request) {
  const member = await prayerMemberFromRequest(request);
  if (!member)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json(
      { ok: false, error: "That request could not be found." },
      { status: 404 },
    );

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("prayer_requests")
    .select("id, audio_path")
    .eq("id", id)
    .eq("member_id", member.memberId)
    .maybeSingle();
  if (!row)
    return NextResponse.json(
      { ok: false, error: "That request could not be found." },
      { status: 404 },
    );
  if (row.audio_path)
    await admin.storage.from(PRAYER_AUDIO_BUCKET).remove([row.audio_path]);
  const { error } = await admin
    .from("prayer_requests")
    .delete()
    .eq("id", id)
    .eq("member_id", member.memberId);
  if (error)
    return NextResponse.json(
      { ok: false, error: "Couldn't remove that request." },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
