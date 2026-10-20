import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_SCOPES,
  cleanScopes,
  hasScope,
  type AdminScope,
} from "@/lib/admin-app/scopes";

export interface AdminCaller {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "service";
  scopes: AdminScope[];
}

const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status });

/**
 * Who is calling an admin-app route, from the bearer token. A platform owner (an email in
 * PLATFORM_ADMIN_EMAILS) has every scope; a service user has the scopes on their active row in
 * platform_service_users. Anyone else gets a plain "no".
 */
export async function adminCaller(
  request: Request,
): Promise<AdminCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const user = data.user;
  const email = user.email!.toLowerCase();
  const name =
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name) ||
    email;

  const owners = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (owners.includes(email))
    return {
      userId: user.id,
      email,
      name,
      role: "owner",
      scopes: [...ADMIN_SCOPES],
    };

  const { data: service } = await admin
    .from("platform_service_users")
    .select("scopes, active, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!service?.active) return null;
  return {
    userId: user.id,
    email,
    name: service.display_name || name,
    role: "service",
    scopes: cleanScopes(service.scopes),
  };
}

/** Runs a route's work for a caller who has the scope; answers 401/403 otherwise, and 500 if the work throws. */
export async function withAdminScope(
  request: Request,
  scope: AdminScope | null,
  work: (caller: AdminCaller) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const caller = await adminCaller(request);
    if (!caller)
      return json({ ok: false, error: "Not signed in as an admin." }, 401);
    if (scope && !hasScope(caller.scopes, scope))
      return json({ ok: false, error: "You don't have access to this." }, 403);
    return await work(caller);
  } catch (err) {
    console.error("admin-app route failed:", err);
    return json(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }
}
