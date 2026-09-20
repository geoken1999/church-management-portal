"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { validateEvent, type EventFieldErrors } from "@/lib/events/validation";
import type { EventMeetingMode, EventRecurrenceFrequency } from "@/types/database";

const EVENTS_PATH = "/dashboard/events";

export interface EventFormState {
  error?: string;
  fieldErrors?: EventFieldErrors;
  success?: boolean;
}

// startAt/endAt arrive already converted to full ISO strings by the client
// (see EventsManager) — the datetime-local input has no timezone of its
// own, so the browser resolves it against the viewer's local time before
// this ever reaches the server. Parsing it here instead would resolve it
// against the server's timezone, silently shifting every event.
function readEventFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    startAt: String(formData.get("startAt") ?? ""),
    endAt: String(formData.get("endAt") ?? "").trim(),
    isRecurring: formData.get("isRecurring") === "true",
    recurrenceFrequency: String(formData.get("recurrenceFrequency") ?? ""),
    recurrenceEndDate: String(formData.get("recurrenceEndDate") ?? "").trim(),
    branchId: String(formData.get("branchId") ?? "").trim(),
    meetingMode: String(formData.get("meetingMode") ?? "offline"),
    meetingLink: String(formData.get("meetingLink") ?? "").trim(),
    managedBy: String(formData.get("managedBy") ?? "").trim(),
  };
}

export async function createEvent(_prevState: EventFormState, formData: FormData): Promise<EventFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const fields = readEventFields(formData);

  const fieldErrors = validateEvent(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    organization_id: organizationId,
    title: fields.title.trim(),
    description: fields.description || null,
    start_at: new Date(fields.startAt).toISOString(),
    end_at: fields.endAt ? new Date(fields.endAt).toISOString() : null,
    is_recurring: fields.isRecurring,
    recurrence_frequency: fields.isRecurring ? (fields.recurrenceFrequency as EventRecurrenceFrequency) : null,
    recurrence_end_date: fields.isRecurring && fields.recurrenceEndDate ? fields.recurrenceEndDate : null,
    branch_id: fields.branchId || null,
    meeting_mode: fields.meetingMode as EventMeetingMode,
    meeting_link: fields.meetingMode === "online" && fields.meetingLink ? fields.meetingLink : null,
    managed_by: fields.managedBy || null,
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't add that event. Please try again." };
  }

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export async function updateEvent(_prevState: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const fields = readEventFields(formData);

  const fieldErrors = validateEvent(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({
      title: fields.title.trim(),
      description: fields.description || null,
      start_at: new Date(fields.startAt).toISOString(),
      end_at: fields.endAt ? new Date(fields.endAt).toISOString() : null,
      is_recurring: fields.isRecurring,
      recurrence_frequency: fields.isRecurring ? (fields.recurrenceFrequency as EventRecurrenceFrequency) : null,
      recurrence_end_date: fields.isRecurring && fields.recurrenceEndDate ? fields.recurrenceEndDate : null,
      branch_id: fields.branchId || null,
      meeting_mode: fields.meetingMode as EventMeetingMode,
      meeting_link: fields.meetingMode === "online" && fields.meetingLink ? fields.meetingLink : null,
      managed_by: fields.managedBy || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export async function deleteEvent(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);

  revalidatePath(EVENTS_PATH);
}
