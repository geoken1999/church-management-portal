"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkStorageQuota } from "@/lib/plans/dal";
import {
  validateRegistrationSettings,
  sanitizeRegistrationFields,
  DEFAULT_REGISTRATION_FIELDS,
  MAX_PASS_BACKGROUND_BYTES,
  ALLOWED_PASS_BACKGROUND_TYPES,
  PASS_BACKGROUND_WIDTH,
  PASS_BACKGROUND_HEIGHT,
  type RegistrationSettingsErrors,
} from "@/lib/events/registration-validation";
import { getImageDimensions } from "@/lib/events/image-dimensions";
import type { EventRegistration } from "@/types/database";

const EVENTS_PATH = "/dashboard/events";

// A read, exposed as a Server Action (rather than the plain server-only
// getEventRegistrations in registration-dal.ts) specifically so the
// Registrants tab — a Client Component, since it's inside an already-open
// dialog rather than rendered up front with the page — can call it
// directly and re-fetch after a check-in/cancel action.
export async function fetchEventRegistrations(eventId: string): Promise<EventRegistration[]> {
  await requireUser();
  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return [];

  const access = await checkTabAccess(organizationId, "events", "read");
  if (!access.ok) return [];

  const admin = createAdminClient();
  const { data } = await admin.from("event_registrations").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
  return data ?? [];
}

async function organizationIdForEvent(eventId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
  return data?.organization_id ?? null;
}

export interface RegistrationSettingsState {
  error?: string;
  fieldErrors?: RegistrationSettingsErrors;
  success?: boolean;
}

// Turns registration on for the first time, seeding the default
// Name/Email fields — a no-op (just re-enables) if it was previously
// disabled, since the field set/capacity/closes-at already exist on the
// event row and shouldn't be clobbered back to defaults.
export async function enableEventRegistration(eventId: string): Promise<RegistrationSettingsState> {
  await requireUser();
  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return { error: "That event could not be found." };

  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("registration_fields").eq("id", eventId).maybeSingle();

  const needsDefaultFields = !event?.registration_fields || (Array.isArray(event.registration_fields) && event.registration_fields.length === 0);
  const update = needsDefaultFields ? { registration_enabled: true, registration_fields: DEFAULT_REGISTRATION_FIELDS } : { registration_enabled: true };

  const { error } = await admin.from("events").update(update).eq("id", eventId);
  if (error) return { error: "Couldn't enable registration. Please try again." };

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export async function disableEventRegistration(formData: FormData) {
  await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return;

  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("events").update({ registration_enabled: false }).eq("id", eventId);

  revalidatePath(EVENTS_PATH);
}

function readFieldsFromFormData(formData: FormData) {
  const raw = String(formData.get("fields") ?? "[]");
  try {
    return sanitizeRegistrationFields(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function updateEventRegistrationSettings(
  _prevState: RegistrationSettingsState,
  formData: FormData,
): Promise<RegistrationSettingsState> {
  await requireUser();

  const eventId = String(formData.get("eventId") ?? "");
  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) {
    return { error: "That event could not be found." };
  }
  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readFieldsFromFormData(formData);
  const capacity = String(formData.get("capacity") ?? "");
  const closesAt = String(formData.get("closesAt") ?? "");
  const passColor = String(formData.get("passColor") ?? "#7c3aed");
  const passMessage = String(formData.get("passMessage") ?? "").trim();

  const fieldErrors = validateRegistrationSettings({ fields, capacity, closesAt, passColor });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({
      registration_fields: fields,
      registration_capacity: capacity.trim() ? Number(capacity) : null,
      registration_closes_at: closesAt.trim() ? new Date(closesAt).toISOString() : null,
      registration_pass_color: passColor.trim(),
      registration_pass_message: passMessage || null,
    })
    .eq("id", eventId);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export async function cancelEventRegistration(formData: FormData) {
  await requireUser();
  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "events", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("event_registrations").update({ status: "cancelled" }).eq("id", registrationId);

  revalidatePath(EVENTS_PATH);
}

export async function markRegistrationCheckedIn(formData: FormData) {
  await requireUser();
  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("event_registrations").update({ status: "checked_in", checked_in_at: new Date().toISOString() }).eq("id", registrationId);

  revalidatePath(EVENTS_PATH);
}

export interface PassBackgroundState {
  error?: string;
}

// Kept as its own Server Action (rather than folded into
// updateEventRegistrationSettings) since it's the only field on this form
// backed by a file upload — everything else is plain form data uploaded
// with a single JSON-ish submit, but a File needs its own request so the
// image can start uploading the moment it's chosen, same split as
// updateOrganizationLogo vs. the rest of an org's profile form.
export async function uploadRegistrationPassBackground(
  _prevState: PassBackgroundState,
  formData: FormData,
): Promise<PassBackgroundState> {
  await requireUser();

  const eventId = String(formData.get("eventId") ?? "");
  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return { error: "That event could not be found." };

  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) return { error: access.message };

  const file = formData.get("background");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!ALLOWED_PASS_BACKGROUND_TYPES.includes(file.type)) {
    return { error: "Background must be a PNG, JPEG, or WebP image." };
  }
  if (file.size > MAX_PASS_BACKGROUND_BYTES) {
    return { error: `Background must be smaller than ${Math.round(MAX_PASS_BACKGROUND_BYTES / (1024 * 1024))}MB.` };
  }

  // The client already checks this before submitting, but that's only a
  // convenience — this is the actual gate, since a direct API call or a
  // stale client could otherwise skip it entirely.
  const bytes = Buffer.from(await file.arrayBuffer());
  const dimensions = getImageDimensions(bytes);
  if (!dimensions || dimensions.width !== PASS_BACKGROUND_WIDTH || dimensions.height !== PASS_BACKGROUND_HEIGHT) {
    return {
      error: dimensions
        ? `That image is ${dimensions.width}x${dimensions.height}px — it must be exactly ${PASS_BACKGROUND_WIDTH}x${PASS_BACKGROUND_HEIGHT}px.`
        : "Couldn't read that image's dimensions. Please try a different file.",
    };
  }

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) return { error: quotaError };

  const admin = createAdminClient();
  const path = `${organizationId}/${eventId}`;

  const { error: uploadError } = await admin.storage
    .from("event-pass-backgrounds")
    .upload(path, bytes, { upsert: true, contentType: file.type });
  if (uploadError) {
    return { error: "Couldn't upload that image. Please try again." };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("event-pass-backgrounds").getPublicUrl(path);

  // Cache-bust: the object path never changes on re-upload, so without a
  // query param a mail client that cached the previous image would keep
  // showing it.
  const { error: updateError } = await admin
    .from("events")
    .update({ registration_pass_background_url: `${publicUrl}?v=${Date.now()}` })
    .eq("id", eventId);
  if (updateError) {
    return { error: "Uploaded the image, but couldn't save it. Please try again." };
  }

  revalidatePath(EVENTS_PATH);
  return {};
}

export async function removeRegistrationPassBackground(formData: FormData) {
  await requireUser();

  const eventId = String(formData.get("eventId") ?? "");
  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return;

  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.storage.from("event-pass-backgrounds").remove([`${organizationId}/${eventId}`]);
  await admin.from("events").update({ registration_pass_background_url: null }).eq("id", eventId);

  revalidatePath(EVENTS_PATH);
}
