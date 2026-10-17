import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewProfileUpdateRequest } from "@/lib/members/profile-update-review";

// Called from the staff mobile app's Members screen: an owner or admin
// approves or rejects a member's profile change request.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );

  let body: { requestId?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const decision =
    body.decision === "approved" || body.decision === "rejected"
      ? body.decision
      : null;
  if (!requestId || !decision)
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );

  const { data: target } = await admin
    .from("member_profile_update_requests")
    .select("organization_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!target)
    return NextResponse.json(
      { ok: false, error: "That request could not be found." },
      { status: 404 },
    );

  const { data: staff } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", target.organization_id)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!staff || (staff.role !== "owner" && staff.role !== "admin")) {
    return NextResponse.json(
      { ok: false, error: "Only an owner or admin can review this." },
      { status: 403 },
    );
  }

  const result = await reviewProfileUpdateRequest({
    requestId,
    organizationId: target.organization_id,
    reviewerId: userData.user.id,
    decision,
  });
  return NextResponse.json(result);
}
