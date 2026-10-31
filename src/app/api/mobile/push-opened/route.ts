import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The app calls this when someone taps a notification an admin sent, so the sender can see how many opened it.
// Who they are comes from the session. Only a member of the church that sent it can be counted, and a second tap
// by the same person changes nothing.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let broadcastId = "";
  try {
    const body = (await request.json()) as { broadcastId?: unknown };
    broadcastId = typeof body.broadcastId === "string" ? body.broadcastId : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(broadcastId)) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth.user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  const { data: broadcast } = await admin.from("push_broadcasts").select("organization_id").eq("id", broadcastId).maybeSingle();
  if (!broadcast) return NextResponse.json({ ok: true });
  const { data: member } = await admin
    .from("members")
    .select("id")
    .eq("organization_id", broadcast.organization_id)
    .eq("auth_user_id", auth.user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return NextResponse.json({ ok: true });

  await admin.from("push_opens").upsert({ broadcast_id: broadcastId, auth_user_id: auth.user.id }, { onConflict: "broadcast_id,auth_user_id", ignoreDuplicates: true });
  return NextResponse.json({ ok: true });
}
