import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateProposedChanges } from "@/lib/members/profile-update-requests";
import type { MemberProposedChanges } from "@/types/database";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Called from the mobile app's My Details screen, once a member has
// already completed login (members.auth_user_id set — see
// /api/mobile/member-auth/complete). Looking the member up by
// auth_user_id here, rather than re-matching the phone number the way
// check-phone/complete do, is possible — and simpler/more robust — only
// because that link already exists by the time this route is ever
// reachable.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });
  }

  let body: { changes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const changes = body.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return NextResponse.json({ ok: false, error: "No changes were submitted." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });
  }

  const { data: member } = await admin
    .from("members")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ ok: false, error: "No member account is linked to this session." }, { status: 404 });
  }

  const proposedChanges = changes as MemberProposedChanges;
  const validationError = validateProposedChanges(member, proposedChanges);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError });
  }

  const { error: insertError } = await admin.from("member_profile_update_requests").insert({
    organization_id: member.organization_id,
    member_id: member.id,
    proposed_changes: proposedChanges,
  });

  if (insertError) {
    // 23505 = unique_violation — member_profile_update_requests_one_pending_idx
    // (migration 0123): this member already has an unreviewed request.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: false, error: "You already have a change waiting for approval. You can submit another once that's reviewed." });
    }
    console.error("member_profile_update_requests insert failed:", insertError.message);
    await logPlatformEvent({
      level: "error",
      source: "member_mobile_login",
      message: `Profile update request insert failed: ${insertError.message}`,
      organizationId: member.organization_id,
      metadata: { memberId: member.id },
    });
    return NextResponse.json({ ok: false, error: "Couldn't submit that change. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
