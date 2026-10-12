import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fullTabAccess, normalizeTabPermissions, type TabKey } from "@/lib/permissions/tabs";
import { getDisabledFeatures } from "@/lib/platform-admin/feature-flags";
import { getOrgFeatureState } from "@/lib/plans/dal";
import type { TabAccess } from "@/types/database";

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

// For the staff mobile app's API routes that mirror a web feature: verifies the
// bearer session, and that this person may [level] the [tab] in [organizationId]
// — the same checks as the web's checkTabAccess (platform kill switch, the
// church's plan, then the person's own permissions), but for a bearer token
// instead of a browser cookie.
export async function requireMobileTabAccess(
  request: Request,
  organizationId: string,
  tab: TabKey,
  level: keyof TabAccess,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });
  if (!organizationId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });

  const disabled = await getDisabledFeatures(userData.user.email);
  if (disabled.has(tab)) return NextResponse.json({ ok: false, error: "This feature isn't available right now." }, { status: 403 });
  const orgState = await getOrgFeatureState(organizationId);
  if (!orgState.tabs[tab]) return NextResponse.json({ ok: false, error: "This feature isn't included in your plan." }, { status: 403 });

  const { data: staff } = await admin
    .from("organization_members")
    .select("role, tab_permissions")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!staff) return NextResponse.json({ ok: false, error: "You don't have access to this organization." }, { status: 403 });

  const access = staff.role === "owner" || staff.role === "admin" ? fullTabAccess() : normalizeTabPermissions(staff.tab_permissions)[tab];
  if (!access[level]) {
    const verb = level === "read" ? "view" : level === "write" ? "edit" : "delete";
    return NextResponse.json({ ok: false, error: `You don't have permission to ${verb} this.` }, { status: 403 });
  }
  return { userId: userData.user.id };
}

// For routes any signed-in team member may use (like Support): verifies the
// bearer session and that the person belongs to [organizationId], with no tab
// permission involved (the web's Support page has none either).
export async function requireMobileTeamMember(request: Request, organizationId: string): Promise<{ userId: string; token: string } | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });
  if (!organizationId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });

  const { data: staff } = await admin
    .from("organization_members")
    .select("auth_user_id")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!staff) return NextResponse.json({ ok: false, error: "You don't have access to this organization." }, { status: 403 });
  return { userId: userData.user.id, token };
}
