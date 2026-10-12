import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// For the staff mobile app's API routes: verifies the bearer session and that
// the person is an owner or admin of [organizationId]. Returns the user's id,
// or the error response to send straight back.
export async function requireMobileAdmin(request: Request, organizationId: string): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });
  if (!organizationId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });

  const { data: staff } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!staff || (staff.role !== "owner" && staff.role !== "admin")) {
    return NextResponse.json({ ok: false, error: "Only an owner or admin can do this." }, { status: 403 });
  }
  return { userId: userData.user.id };
}
