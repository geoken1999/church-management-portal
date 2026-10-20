"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { minutesAvailableFor } from "@/lib/kmeet/minutes-service";
import { getOrgFeatureState } from "@/lib/plans/dal";
import { zonedTimeToUtc, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { authorizeCurriculum } from "@/lib/lms/authz";
import { enrolledStudentLogins } from "@/lib/lms/live-service";
import { getAttendanceRoster, type AttendanceRosterRow } from "@/lib/lms/dal";
import { logLmsEvent } from "@/lib/lms/audit";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import {
  durationProblem,
  endsAt,
  validateSession,
  whenText,
  type SessionInput,
} from "@/lib/lms/live";
import { hasErrors } from "@/lib/lms/validation";
import { isHttpsUrl } from "@/lib/lms/validation";
import type { LmsResult } from "@/lib/lms/actions";

const fail = (message: string): LmsResult => ({ error: message });

function refresh(courseId: string) {
  revalidatePath(`${LMS_BASE_PATH}/courses/${courseId}`);
  revalidatePath(`${LMS_BASE_PATH}/live-classes`);
}

async function notifyStudents(
  courseId: string,
  kind: "event_new" | "event_update",
  title: string,
  body: string,
  sessionId: string,
) {
  try {
    const logins = await enrolledStudentLogins(courseId);
    if (logins.length > 0)
      await sendPushToUsers(logins, kind, {
        title,
        body,
        data: { type: "lms_class", sessionId, courseId },
      });
  } catch (err) {
    console.error("notifyStudents failed:", err);
  }
}

async function churchContext(organizationId: string, mode: "video" | "audio") {
  const admin = createAdminClient();
  const [{ data: org }, minutesLeft, state] = await Promise.all([
    admin
      .from("organizations")
      .select("timezone")
      .eq("id", organizationId)
      .maybeSingle(),
    minutesAvailableFor(organizationId, mode),
    getOrgFeatureState(organizationId),
  ]);
  const tab = mode === "audio" ? "kaudio" : "kmeet";
  return {
    timeZone: org?.timezone || DEFAULT_TIMEZONE,
    // What is left of this month's K-Connect minutes; a class longer than that would be cut off.
    planMax: minutesLeft,
    callsAvailable: state.tabs[tab],
  };
}

// Schedules a class for a course: creates its K-Connect room, then tells the enrolled students.
export async function scheduleSessionAction(
  organizationId: string,
  courseId: string,
  input: SessionInput,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  if (!isVideoSdkConfigured())
    return fail(
      "Video calling isn't set up yet. Ask your developer to configure it.",
    );
  if (input.mode !== "video" && input.mode !== "audio")
    return { fieldErrors: { mode: "Choose video or audio." } };

  const ctx = await churchContext(organizationId, input.mode);
  if (!ctx.callsAvailable)
    return fail(
      `${input.mode === "audio" ? "K-Connect audio" : "K-Connect video"} isn't included in your plan.`,
    );
  const fieldErrors = validateSession(input, new Date(), ctx.timeZone, {
    requireFuture: true,
  });
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const minutes = Number(input.durationMinutes);
  const problem = durationProblem(minutes, ctx.planMax);
  if (problem) return { fieldErrors: { durationMinutes: problem } };

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("lms_courses")
    .select("title, status")
    .eq("id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!course) return fail("That course could not be found.");

  const start = zonedTimeToUtc(input.startsAtLocal, ctx.timeZone);
  const end = endsAt(start, minutes);
  const title = input.title.trim();

  const { data: meeting, error: meetingError } = await admin
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title: `${course.title}: ${title}`,
      description: input.description.trim() || null,
      scheduled_at: start.toISOString(),
      status: "scheduled",
      require_admission: false,
      mode: input.mode,
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (meetingError || !meeting)
    return fail("Couldn't create the class room. Please try again.");

  const { data: session, error } = await admin
    .from("lms_live_sessions")
    .insert({
      organization_id: organizationId,
      course_id: courseId,
      meeting_id: meeting.id,
      title,
      description: input.description.trim() || null,
      mode: input.mode,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      created_by: access.userId,
      announced_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) {
    await admin.from("kmeet_meetings").delete().eq("id", meeting.id);
    return fail("Couldn't schedule the class. Please try again.");
  }

  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "session.scheduled",
    entityType: "session",
    entityId: session.id,
    metadata: { courseId },
  });
  await notifyStudents(
    courseId,
    "event_new",
    `New class: ${title}`,
    `${course.title} · ${whenText(start.toISOString(), ctx.timeZone)}`,
    session.id,
  );
  refresh(courseId);
  return { success: true, id: session.id };
}

// Changes a class's title, description or time. A new time resets the reminder and tells students.
export async function updateSessionAction(
  organizationId: string,
  sessionId: string,
  input: SessionInput,
): Promise<LmsResult> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("lms_live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!session) return fail("That class could not be found.");
  const access = await authorizeCurriculum(organizationId, session.course_id);
  if (!access.ok) return fail(access.message);
  if (session.status === "cancelled")
    return fail("A cancelled class can't be changed. Schedule a new one.");

  const ctx = await churchContext(organizationId, session.mode);
  const fieldErrors = validateSession(
    { ...input, mode: session.mode },
    new Date(),
    ctx.timeZone,
    { requireFuture: false },
  );
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const minutes = Number(input.durationMinutes);
  const problem = durationProblem(minutes, ctx.planMax);
  if (problem) return { fieldErrors: { durationMinutes: problem } };

  const start = zonedTimeToUtc(input.startsAtLocal, ctx.timeZone);
  const end = endsAt(start, minutes);
  const moved =
    start.toISOString() !== new Date(session.starts_at).toISOString();
  if (moved && start.getTime() < Date.now() - 60_000)
    return { fieldErrors: { startsAtLocal: "Choose a time in the future." } };

  const title = input.title.trim();
  const { error } = await admin
    .from("lms_live_sessions")
    .update({
      title,
      description: input.description.trim() || null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      ...(moved
        ? { reminder_sent_at: null, announced_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", sessionId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't save the class. Please try again.");

  if (session.meeting_id) {
    const { data: course } = await admin
      .from("lms_courses")
      .select("title")
      .eq("id", session.course_id)
      .maybeSingle();
    await admin
      .from("kmeet_meetings")
      .update({
        title: `${course?.title ?? "Class"}: ${title}`,
        description: input.description.trim() || null,
        scheduled_at: start.toISOString(),
      })
      .eq("id", session.meeting_id)
      .eq("status", "scheduled");
  }
  if (moved) {
    await logLmsEvent({
      organizationId,
      actorAuthUserId: access.userId,
      action: "session.rescheduled",
      entityType: "session",
      entityId: sessionId,
    });
    await notifyStudents(
      session.course_id,
      "event_update",
      `Class moved: ${title}`,
      `Now ${whenText(start.toISOString(), ctx.timeZone)}`,
      sessionId,
    );
  }
  refresh(session.course_id);
  return { success: true, id: sessionId };
}

export async function cancelSessionAction(
  organizationId: string,
  sessionId: string,
): Promise<LmsResult> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("lms_live_sessions")
    .select("course_id, title, status, meeting_id, starts_at")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!session) return fail("That class could not be found.");
  const access = await authorizeCurriculum(organizationId, session.course_id);
  if (!access.ok) return fail(access.message);
  if (session.status === "cancelled") return { success: true };

  const { error } = await admin
    .from("lms_live_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't cancel the class. Please try again.");
  // The room goes with it, unless the class already started.
  if (session.meeting_id)
    await admin
      .from("kmeet_meetings")
      .delete()
      .eq("id", session.meeting_id)
      .eq("status", "scheduled");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "session.cancelled",
    entityType: "session",
    entityId: sessionId,
  });
  const { data: org } = await admin
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();
  await notifyStudents(
    session.course_id,
    "event_update",
    `Class cancelled: ${session.title}`,
    `It was planned for ${whenText(session.starts_at, org?.timezone || DEFAULT_TIMEZONE)}.`,
    sessionId,
  );
  refresh(session.course_id);
  return { success: true };
}

// A teacher sets a student's attendance by hand (for someone who joined another way, or was excused).
export async function setAttendanceAction(
  organizationId: string,
  sessionId: string,
  memberId: string,
  status: "present" | "absent" | "excused",
): Promise<LmsResult> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("lms_live_sessions")
    .select("course_id")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!session) return fail("That class could not be found.");
  const access = await authorizeCurriculum(organizationId, session.course_id);
  if (!access.ok) return fail(access.message);
  if (!["present", "absent", "excused"].includes(status))
    return fail("Choose present, absent or excused.");
  // Only a student of this course.
  const { data: enrollment } = await admin
    .from("lms_enrollments")
    .select("id")
    .eq("course_id", session.course_id)
    .eq("member_id", memberId)
    .in("status", ["approved", "active", "completed"])
    .limit(1)
    .maybeSingle();
  if (!enrollment) return fail("That student isn't enrolled in this course.");
  const { error } = await admin.from("lms_session_attendance").upsert(
    {
      session_id: sessionId,
      member_id: memberId,
      organization_id: organizationId,
      status,
      source: "manual",
      marked_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id,member_id" },
  );
  if (error) return fail("Couldn't save attendance. Please try again.");
  refresh(session.course_id);
  return { success: true };
}

// The recording of a class, added afterwards as a link (students see it with the class).
export async function setRecordingAction(
  organizationId: string,
  sessionId: string,
  url: string,
): Promise<LmsResult> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("lms_live_sessions")
    .select("course_id")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!session) return fail("That class could not be found.");
  const access = await authorizeCurriculum(organizationId, session.course_id);
  if (!access.ok) return fail(access.message);
  const clean = url.trim();
  if (clean && !isHttpsUrl(clean))
    return fail("The recording link must start with https://.");
  const { error } = await admin
    .from("lms_live_sessions")
    .update({ recording_url: clean || null })
    .eq("id", sessionId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't save the recording link. Please try again.");
  refresh(session.course_id);
  return { success: true };
}

// The students of a class's course with their attendance, for the roster a teacher marks.
export async function loadAttendanceRosterAction(
  organizationId: string,
  sessionId: string,
): Promise<{ error?: string; roster?: AttendanceRosterRow[] }> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("lms_live_sessions")
    .select("course_id")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!session) return { error: "That class could not be found." };
  const access = await authorizeCurriculum(organizationId, session.course_id);
  if (!access.ok) return { error: access.message };
  return { roster: await getAttendanceRoster(organizationId, sessionId) };
}
