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
