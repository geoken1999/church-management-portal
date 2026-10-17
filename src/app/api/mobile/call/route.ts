import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateParticipantToken } from "@/lib/kmeet/token";
import {
  participantPermissionsFor,
  resolveMeetingRoom,
} from "@/lib/kmeet/join";
import {
  answerEntry,
  cancelEntry,
  entryStatus,
  listPendingEntries,
  requestEntry,
} from "@/lib/kmeet/entry";
import { tabKeyForMode } from "@/lib/kmeet/mode";
import { fullTabAccess, normalizeTabPermissions } from "@/lib/permissions/tabs";
import { getDisabledFeatures } from "@/lib/platform-admin/feature-flags";
import { getOrgFeatureState } from "@/lib/plans/dal";
import { studentMayJoin } from "@/lib/lms/student-access";

// The mobile app's own call screen (video and audio, staff and members): what it
// needs to connect to a K-Connect call, and the heartbeat that keeps a call from
// being ended as idle. Staff need read access to the call type's tab and
// moderate with write access, exactly as on the web; a church member joins as a
// participant and waits to be admitted if the call asks for that.
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  if (!/^[0-9a-f-]{36}$/.test(meetingId))
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );
  const user = userData.user;

  // The waiting room's quick check, asked every second or so: just the answer so
  // far, without the full join work.
  if (body.action === "status") {
    const status = await entryStatus(meetingId, user.id);
    return NextResponse.json({ ok: true, status });
  }

  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("id, organization_id, mode, status")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting)
    return NextResponse.json(
      { ok: false, error: "That meeting could not be found." },
      { status: 404 },
    );

  // Who is this person at the meeting's church: staff, or a member?
  const { data: staff } = await admin
    .from("organization_members")
    .select("role, tab_permissions")
    .eq("organization_id", meeting.organization_id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const { data: member } = staff
    ? { data: null }
    : await admin
        .from("members")
        .select("first_name, last_name, status")
        .eq("organization_id", meeting.organization_id)
        .eq("auth_user_id", user.id)
        .maybeSingle();

  let isModerator = false;
  let displayName = "";
  if (staff) {
    const tab = tabKeyForMode(meeting.mode);
    const disabled = await getDisabledFeatures(user.email);
    if (disabled.has(tab))
      return NextResponse.json(
        { ok: false, error: "This feature isn't available right now." },
        { status: 403 },
      );
    const orgState = await getOrgFeatureState(meeting.organization_id);
    if (!orgState.tabs[tab])
      return NextResponse.json(
        { ok: false, error: "This feature isn't included in your plan." },
        { status: 403 },
      );
    const access =
      staff.role === "owner" || staff.role === "admin"
        ? fullTabAccess()
        : normalizeTabPermissions(staff.tab_permissions)[tab];
    if (!access.read)
      return NextResponse.json(
        { ok: false, error: "You don't have access to this call." },
        { status: 403 },
      );
    isModerator = access.write;
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    displayName =
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      user.email ||
      "Guest";
  } else if (member && member.status === "active") {
    displayName = `${member.first_name} ${member.last_name}`.trim();
  } else if (
    member &&
    member.status === "student" &&
    (await studentMayJoin(meetingId, user.id))
  ) {
    // A Bible School student may join the live classes of the courses they are enrolled in, and nothing else.
    displayName = `${member.first_name} ${member.last_name}`.trim();
  } else {
    return NextResponse.json(
      { ok: false, error: "You don't have access to this call." },
      { status: 403 },
    );
  }

  if (body.action === "heartbeat") {
    const { data } = await admin
      .from("kmeet_meetings")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", meetingId)
      .eq("status", "live")
      .select("id")
      .maybeSingle();
    return NextResponse.json({ ok: true, ended: !data });
  }

  // Someone gave up waiting: take their request off the hosts' list.
  if (body.action === "cancel") {
    await cancelEntry(meetingId, user.id);
    return NextResponse.json({ ok: true });
  }

  // Hosts see who is waiting and answer them.
  if (body.action === "pending" || body.action === "respond") {
    if (!isModerator)
      return NextResponse.json(
        { ok: false, error: "Only a host can do this." },
        { status: 403 },
      );
    if (body.action === "respond") {
      const requestId =
        typeof body.requestId === "string" ? body.requestId : "";
      await answerEntry(
        meetingId,
        requestId,
        body.decision === "allowed" ? "allowed" : "denied",
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({
      ok: true,
      requests: await listPendingEntries(meetingId),
    });
  }

  if (body.action !== "join")
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved)
    return NextResponse.json({ ok: false, error: resolved.error });

  // A call that admits people one by one: everyone but a host waits here until a
  // host answers. (Asked again every couple of seconds by the app.)
  let waitStatus: "pending" | "denied" | null = null;
  if (resolved.requireAdmission && !isModerator) {
    const status = await requestEntry(meetingId, user.id, displayName);
    if (status !== "allowed") waitStatus = status;
  }
  if (waitStatus) return NextResponse.json({ ok: true, waiting: waitStatus });

  return NextResponse.json({
    ok: true,
    roomId: resolved.roomId,
    // Admission was already settled above, so people go straight in.
    token: generateParticipantToken(
      resolved.roomId,
      participantPermissionsFor(isModerator, false),
    ),
    displayName,
    isModerator,
    requireAdmission: resolved.requireAdmission,
    startedAt: resolved.startedAt,
    maxDurationMinutes: resolved.maxDurationMinutes,
    mode: resolved.mode,
  });
}
