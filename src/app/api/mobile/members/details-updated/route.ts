import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMember } from "@/lib/push/member-notice";

// Called by the staff mobile app after it saves a member's details, so the
// member hears about it (the app writes to the database directly, so the
// server otherwise never sees the edit).
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });

  let body: { memberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  if (!memberId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });

  const { data: member } = await admin.from("members").select("organization_id, auth_user_id").eq("id", memberId).maybeSingle();
  if (!member) return NextResponse.json({ ok: false, error: "That member could not be found." }, { status: 404 });

  const { data: staff } = await admin
    .from("organization_members")
    .select("auth_user_id")
    .eq("organization_id", member.organization_id)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!staff) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });

  // Editing your own details isn't news to you.
  if (member.auth_user_id !== userData.user.id) {
    await notifyMember(memberId, "Your details were updated", "Your church updated your details. Open the app to review them.");
  }
  return NextResponse.json({ ok: true });
}
