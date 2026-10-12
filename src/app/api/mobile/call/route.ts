import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateParticipantToken } from "@/lib/kmeet/token";
import { participantPermissionsFor, resolveMeetingRoom } from "@/lib/kmeet/join";
import { tabKeyForMode } from "@/lib/kmeet/mode";
import { fullTabAccess, normalizeTabPermissions } from "@/lib/permissions/tabs";
import { getDisabledFeatures } from "@/lib/platform-admin/feature-flags";
import { getOrgFeatureState } from "@/lib/plans/dal";

// The mobile app's own call screen (video and audio, staff and members): what it
// needs to connect to a K-Connect call, and the heartbeat that keeps a call from
// being ended as idle. Staff need read access to the call type's tab and
// moderate with write access, exactly as on the web; a church member joins as a
// participant and waits to be admitted if the call asks for that.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return NextResponse.json({ ok: false, error: "Missing session." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  if (!/^[0-9a-f-]{36}$/.test(meetingId)) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return NextResponse.json({ ok: false, error: "That session could not be verified." }, { status: 401 });
  const user = userData.user;

  const { data: meeting } = await admin.from("kmeet_meetings").select("id, organization_id, mode, status").eq("id", meetingId).maybeSingle();
  if (!meeting) return NextResponse.json({ ok: false, error: "That meeting could not be found." }, { status: 404 });

  // Who is this person at the meeting's church: staff, or a member?
  const { data: staff } = await admin
    .from("organization_members")
    .select("role, tab_permissions")
    .eq("organization_id", meeting.organization_id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const { data: member } = staff
    ? { data: null }
    : await admin.from("members").select("first_name, last_name, status").eq("organization_id", meeting.organization_id).eq("auth_user_id", user.id).maybeSingle();

  let isModerator = false;
  let displayName = "";
  if (staff) {
    const tab = tabKeyForMode(meeting.mode);
    const disabled = await getDisabledFeatures(user.email);
    if (disabled.has(tab)) return NextResponse.json({ ok: false, error: "This feature isn't available right now." }, { status: 403 });
    const orgState = await getOrgFeatureState(meeting.organization_id);
    if (!orgState.tabs[tab]) return NextResponse.json({ ok: false, error: "This feature isn't included in your plan." }, { status: 403 });
    const access = staff.role === "owner" || staff.role === "admin" ? fullTabAccess() : normalizeTabPermissions(staff.tab_permissions)[tab];
    if (!access.read) return NextResponse.json({ ok: false, error: "You don't have access to this call." }, { status: 403 });
    isModerator = access.write;
    const { data: profile } = await admin.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    displayName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || user.email || "Guest";
  } else if (member && member.status === "active") {
    displayName = `${member.first_name} ${member.last_name}`.trim();
  } else {
    return NextResponse.json({ ok: false, error: "You don't have access to this call." }, { status: 403 });
  }

  if (body.action === "heartbeat") {
    const { data } = await admin.from("kmeet_meetings").update({ last_active_at: new Date().toISOString() }).eq("id", meetingId).eq("status", "live").select("id").maybeSingle();
    return NextResponse.json({ ok: true, ended: !data });
  }

  if (body.action !== "join") return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved) return NextResponse.json({ ok: false, error: resolved.error });
  return NextResponse.json({
    ok: true,
    roomId: resolved.roomId,
    token: generateParticipantToken(resolved.roomId, participantPermissionsFor(isModerator, resolved.requireAdmission)),
    displayName,
    isModerator,
    requireAdmission: resolved.requireAdmission,
    startedAt: resolved.startedAt,
    maxDurationMinutes: resolved.maxDurationMinutes,
    mode: resolved.mode,
  });
}
