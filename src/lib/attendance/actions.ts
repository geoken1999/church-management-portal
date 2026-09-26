"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateSessionTitle, validateOccurrenceDate, validateHeadcount } from "@/lib/attendance/validation";

const ATTENDANCE_PATH = "/dashboard/attendance";

async function organizationIdForSession(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("attendance_sessions").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

async function belongsToOrganization(table: "branches" | "events", id: string, organizationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from(table).select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id === organizationId;
}

export interface CreateSessionState {
  error?: string;
  sessionId?: string;
}

// The Events page's "Add to Attendance" shortcut — creates (or, if one
// already exists for this event+date, just returns) an attendance session
// for a single event without making the organizer go to Attendance and
// pick it out of the event dropdown themselves. Once linked, that event's
// online registrants show up as a checklist on the session automatically
// (see AttendanceSessionDetail) — this is what makes that connection.
export async function addEventToAttendance(eventId: string): Promise<CreateSessionState> {
  const user = await requireUser();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("organization_id, title, start_at, branch_id, is_recurring")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return { error: "That event could not be found." };
  }

  const access = await checkTabAccess(event.organization_id, "attendance", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  // A recurring event (e.g. "Sunday Service") is one row, not one per
  // occurrence — clicking this is assumed to mean "for today's
  // occurrence," same reasoning the Attendance session's own
  // occurrence_date field already relies on. A one-off event just uses
  // its own start date.
  const occurrenceDate = event.is_recurring ? new Date().toISOString().slice(0, 10) : new Date(event.start_at).toISOString().slice(0, 10);

  const { data: existing } = await admin
    .from("attendance_sessions")
    .select("id")
    .eq("event_id", eventId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  if (existing) {
    return { sessionId: existing.id };
  }

  const { data: created, error } = await admin
    .from("attendance_sessions")
    .insert({
      organization_id: event.organization_id,
      branch_id: event.branch_id,
      event_id: eventId,
      occurrence_date: occurrenceDate,
      title: event.title,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("addEventToAttendance insert failed:", error?.message);
    return { error: "Couldn't create an attendance session for this event." };
  }

  revalidatePath(ATTENDANCE_PATH);
  return { sessionId: created.id };
}

export async function createAttendanceSession(
  _prevState: CreateSessionState,
  formData: FormData,
): Promise<CreateSessionState> {
  const user = await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "attendance", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const titleError = validateSessionTitle(title);
  if (titleError) return { error: titleError };

  const occurrenceDate = String(formData.get("occurrenceDate") ?? "");
  const dateError = validateOccurrenceDate(occurrenceDate);
  if (dateError) return { error: dateError };

  const headcountRaw = String(formData.get("headcount") ?? "");
  const headcountError = validateHeadcount(headcountRaw);
  if (headcountError) return { error: headcountError };
  const headcount = headcountRaw ? Number(headcountRaw) : null;

  const branchIdRaw = String(formData.get("branchId") ?? "");
  const branchId = branchIdRaw && branchIdRaw !== "none" ? branchIdRaw : null;
  if (branchId && !(await belongsToOrganization("branches", branchId, organizationId))) {
    return { error: "That branch could not be found." };
  }

  const eventIdRaw = String(formData.get("eventId") ?? "");
  const eventId = eventIdRaw && eventIdRaw !== "none" ? eventIdRaw : null;
  if (eventId && !(await belongsToOrganization("events", eventId, organizationId))) {
    return { error: "That event could not be found." };
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendance_sessions")
    .insert({
      organization_id: organizationId,
      branch_id: branchId,
      event_id: eventId,
      occurrence_date: occurrenceDate,
      title,
      notes,
      headcount,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Attendance for that date has already been taken for this event." };
    }
    console.error("attendance_sessions insert failed:", error.message);
    return { error: "Couldn't create that session. Please try again." };
  }

  revalidatePath(ATTENDANCE_PATH);
  return { sessionId: data.id };
}

export async function deleteAttendanceSession(formData: FormData) {
  await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");

  const organizationId = await organizationIdForSession(sessionId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "attendance", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("attendance_sessions").delete().eq("id", sessionId);

  revalidatePath(ATTENDANCE_PATH);
}

export interface ToggleAttendanceState {
  error?: string;
  present?: boolean;
}

// Called directly from the roster checklist's click handler — presence is
// row-existence in attendance_records, so "marking present" inserts a row
// and "marking absent" deletes it.
export async function toggleAttendanceRecord(sessionId: string, memberId: string, present: boolean): Promise<ToggleAttendanceState> {
  await requireUser();

  const organizationId = await organizationIdForSession(sessionId);
  if (!organizationId) {
    return { error: "That session could not be found." };
  }
  const access = await checkTabAccess(organizationId, "attendance", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();

  if (present) {
    const { error } = await admin
      .from("attendance_records")
      .upsert({ organization_id: organizationId, session_id: sessionId, member_id: memberId }, { onConflict: "session_id,member_id" });
    if (error) {
      console.error("attendance_records upsert failed:", error.message);
      return { error: "Couldn't update attendance. Please try again." };
    }
  } else {
    const { error } = await admin
      .from("attendance_records")
      .delete()
      .eq("session_id", sessionId)
      .eq("member_id", memberId);
    if (error) {
      return { error: "Couldn't update attendance. Please try again." };
    }
  }

  revalidatePath(`${ATTENDANCE_PATH}/${sessionId}`);
  return { present };
}

export interface ToggleRegistrationCheckInState {
  error?: string;
  checkedIn?: boolean;
}

// Checks in (or undoes checking in) someone who registered online for the
// event this session is linked to — a separate action from
// toggleAttendanceRecord because registrants aren't necessarily existing
// Members (event_registrations has no member_id at all; someone could
// register who's never set foot in the church before), so their presence
// lives on event_registrations.status instead of attendance_records.
// Gated by the Attendance tab's own permissions (not Events') since that's
// the tab this is actually surfaced in.
export async function toggleEventRegistrationCheckIn(
  sessionId: string,
  registrationId: string,
  checkedIn: boolean,
): Promise<ToggleRegistrationCheckInState> {
  await requireUser();

  const organizationId = await organizationIdForSession(sessionId);
  if (!organizationId) {
    return { error: "That session could not be found." };
  }
  const access = await checkTabAccess(organizationId, "attendance", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("event_registrations")
    .update(checkedIn ? { status: "checked_in", checked_in_at: new Date().toISOString() } : { status: "confirmed", checked_in_at: null })
    .eq("id", registrationId)
    .eq("organization_id", organizationId);

  if (error) {
    return { error: "Couldn't update check-in status. Please try again." };
  }

  revalidatePath(`${ATTENDANCE_PATH}/${sessionId}`);
  return { checkedIn };
}

export interface UpdateHeadcountState {
  error?: string;
}

export async function updateSessionHeadcount(sessionId: string, headcountRaw: string): Promise<UpdateHeadcountState> {
  await requireUser();

  const organizationId = await organizationIdForSession(sessionId);
  if (!organizationId) {
    return { error: "That session could not be found." };
  }
  const access = await checkTabAccess(organizationId, "attendance", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const headcountError = validateHeadcount(headcountRaw);
  if (headcountError) return { error: headcountError };
  const headcount = headcountRaw ? Number(headcountRaw) : null;

  const admin = createAdminClient();
  const { error } = await admin.from("attendance_sessions").update({ headcount }).eq("id", sessionId);
  if (error) {
    return { error: "Couldn't update the headcount. Please try again." };
  }

  revalidatePath(`${ATTENDANCE_PATH}/${sessionId}`);
  return {};
}
