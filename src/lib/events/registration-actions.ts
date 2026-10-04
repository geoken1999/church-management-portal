"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkStorageQuota, getPlanUsage } from "@/lib/plans/dal";
import { requireFinancePlan } from "@/lib/finance/actions";
import { sharedServiceNetAmount } from "@/lib/finance/fees";
import { notifyPlatformAdmins } from "@/lib/platform-admin/notify";
import {
  validateRegistrationSettings,
  validatePaymentSettings,
  sanitizeRegistrationFields,
  DEFAULT_REGISTRATION_FIELDS,
  MAX_PASS_BACKGROUND_BYTES,
  ALLOWED_PASS_BACKGROUND_TYPES,
  PASS_BACKGROUND_WIDTH,
  PASS_BACKGROUND_HEIGHT,
  type RegistrationSettingsErrors,
} from "@/lib/events/registration-validation";
import { getImageDimensions } from "@/lib/events/image-dimensions";
import { sendPassEmailForRegistration } from "@/lib/events/public-registration-actions";
import type { EventRegistration, EventReminderOffset, EventPaymentGateway, EventPaymentTiming } from "@/types/database";

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
  const reminderOffset = String(formData.get("reminderOffset") ?? "").trim();
  const paymentRequired = formData.get("paymentRequired") === "true";
  const paymentGateway = String(formData.get("paymentGateway") ?? "").trim();
  const paymentAmount = String(formData.get("paymentAmount") ?? "").trim();
  const externalPaymentUrl = String(formData.get("externalPaymentUrl") ?? "").trim();
  const paymentTiming = String(formData.get("paymentTiming") ?? "").trim();

  const fieldErrors = validateRegistrationSettings({ fields, capacity, closesAt, passColor, reminderOffset });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  // Re-checked live (not just trusted from the client) — same defensive
  // reasoning as createGivingOrder's own re-check: the org's plan can
  // change between when this form was rendered and when it's submitted.
  const planAccess = await getPlanUsage(organizationId);
  const paymentErrors = validatePaymentSettings({
    paymentRequired,
    paymentGateway,
    paymentAmount,
    externalPaymentUrl,
    paymentTiming,
    financeEnabled: planAccess.plan.financeEnabled,
  });
  if (Object.values(paymentErrors).some(Boolean)) {
    return { fieldErrors: paymentErrors };
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
      reminder_offset: (reminderOffset || null) as EventReminderOffset | null,
      payment_required: paymentRequired,
      payment_gateway: paymentRequired ? (paymentGateway as EventPaymentGateway) : null,
      payment_amount: paymentRequired ? Number(paymentAmount) : null,
      external_payment_url: paymentRequired && paymentGateway === "external" ? externalPaymentUrl : null,
      payment_timing: paymentRequired ? (paymentTiming as EventPaymentTiming) : null,
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

// The only payment-confirmation path for "your own payment link" (no
// API/webhook into whatever gateway the organizer actually uses, so it's
// never automatic) — also the fallback for the platform gateway when a
// Razorpay checkout callback/webhook was missed, or payment came in some
// other way entirely (bank transfer, cash before the event). Callable
// from both the Registrants tab and the Attendance check-in screen.
export async function markRegistrationPaid(formData: FormData) {
  await requireUser();
  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("event_registrations")
    .select("payment_status, events(payment_timing)")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration || registration.payment_status === "paid") return;

  await admin.from("event_registrations").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", registrationId);

  // "before_registration" (and "both", until the visitor resolves their
  // choice) withholds the pass until payment is confirmed — this is the
  // first moment that becomes true for an external-gateway registration
  // (or a platform-gateway one being reconciled manually). "at_checkin"
  // registrations already got their pass at registration time, so
  // there's nothing to send here.
  const event = registration.events as { payment_timing: string | null } | null;
  if (event?.payment_timing === "before_registration" || event?.payment_timing === "both") {
    await sendPassEmailForRegistration(registrationId);
  }

  revalidatePath(EVENTS_PATH);
}

export interface EventPayoutRequestState {
  error?: string;
  success?: boolean;
}

// Asks the platform to pay out a platform-gateway event's collected
// balance — mirrors requestFundraiserPayout (src/lib/finance/actions.ts)
// exactly. Only ever creates a request row; see /platform-admin/payouts
// for where it's actually fulfilled (still a manual bank transfer,
// recorded there once done).
export async function requestEventPayout(
  _prevState: EventPayoutRequestState,
  formData: FormData,
): Promise<EventPayoutRequestState> {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");

  const organizationId = await organizationIdForEvent(eventId);
  if (!organizationId) {
    return { error: "That event could not be found." };
  }
  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }
  const access = await checkTabAccess(organizationId, "events", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();

  // Computed fresh here rather than trusting a client-submitted amount.
  // "Collected" is read from event_registration_payment_orders, not
  // event_registrations.payment_status — see getEventPayoutLedger
  // (src/lib/events/dal.ts) for why that distinction matters.
  const [{ data: event }, { data: orders }, { data: payouts }, { data: existingPending }] = await Promise.all([
    admin.from("events").select("payment_gateway").eq("id", eventId).maybeSingle(),
    admin.from("event_registration_payment_orders").select("amount").eq("event_id", eventId).eq("status", "paid"),
    admin.from("event_payouts").select("amount").eq("event_id", eventId),
    admin.from("event_payout_requests").select("id").eq("event_id", eventId).eq("status", "pending").maybeSingle(),
  ]);

  if (!event || event.payment_gateway !== "platform") {
    return { error: "This event isn't using the platform's payment gateway." };
  }
  if (existingPending) {
    return { error: "A payout request is already pending for this event." };
  }

  const collected = (orders ?? []).reduce((sum, row) => sum + row.amount, 0);
  const paidOut = (payouts ?? []).reduce((sum, row) => sum + row.amount, 0);
  const owed = sharedServiceNetAmount(collected) - paidOut;

  if (owed <= 0) {
    return { error: "There's nothing owed to request a payout for." };
  }

  const { error } = await admin.from("event_payout_requests").insert({
    organization_id: organizationId,
    event_id: eventId,
    amount: owed,
    requested_by: user.id,
  });

  if (error) {
    return { error: "Couldn't submit that payout request. Please try again." };
  }

  await notifyPlatformAdmins(
    "New event payout request",
    `<p>An organization has requested a payout of <strong>₹${owed.toFixed(2)}</strong> for an event's collected registrations.</p><p>Review and record it from Platform Admin → Payouts.</p>`,
  );

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export async function cancelEventPayoutRequest(formData: FormData) {
  await requireUser();
  const requestId = String(formData.get("requestId") ?? "");

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("event_payout_requests")
    .select("organization_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status !== "pending") return;

  if (await requireFinancePlan(request.organization_id)) return;
  const access = await checkTabAccess(request.organization_id, "events", "write");
  if (!access.ok) return;

  await admin.from("event_payout_requests").update({ status: "cancelled" }).eq("id", requestId);

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
