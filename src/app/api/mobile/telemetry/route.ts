import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorFingerprint, parseTelemetry } from "@/lib/mobile-health/fingerprint";

// The mobile app's health reports (sessions, errors it caught, sessions that seem to
// have ended in a crash), shown to the platform admin. Works before sign-in too, so
// a login problem is reported; when the app is signed in it also says who and which
// church. Capped per device so a misbehaving app can't fill the database.
const MAX_REPORTS_PER_DEVICE_PER_HOUR = 60;

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const report = parseTelemetry(raw);
  if (!report) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();

  // Who is this, if signed in. A bad or missing token just means anonymous.
  let authUserId: string | null = null;
  let organizationId: string | null = null;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data.user) {
      authUserId = data.user.id;
      const { data: profile } = await admin.from("profiles").select("active_organization_id").eq("id", authUserId).maybeSingle();
      organizationId = profile?.active_organization_id ?? null;
    }
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from("mobile_app_events").select("id", { count: "exact", head: true }).eq("device_id", report.deviceId).gt("created_at", hourAgo);
  if ((count ?? 0) >= MAX_REPORTS_PER_DEVICE_PER_HOUR) return NextResponse.json({ ok: true, dropped: true });

  const now = new Date().toISOString();
  await admin.from("mobile_app_devices").upsert(
    {
      device_id: report.deviceId,
      platform: report.platform,
      app_version: report.appVersion,
      build_number: report.buildNumber,
      os_version: report.osVersion,
      device_model: report.deviceModel,
      role: report.role,
      auth_user_id: authUserId,
      organization_id: organizationId,
      last_seen_at: now,
    },
    { onConflict: "device_id" },
  );

  await admin.from("mobile_app_events").insert({
    device_id: report.deviceId,
    kind: report.kind,
    platform: report.platform,
    app_version: report.appVersion,
    os_version: report.osVersion,
    device_model: report.deviceModel,
    screen: report.screen,
    message: report.message,
    stack: report.stack,
    fingerprint: report.kind === "session" ? "" : errorFingerprint(report.message, report.screen),
    auth_user_id: authUserId,
    organization_id: organizationId,
  });

  return NextResponse.json({ ok: true });
}
