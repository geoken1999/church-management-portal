"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRegistrationPassEmail } from "@/lib/events/registration-pass";
import { eventVenueLabel, eventJoinLink } from "@/lib/events/location";
import type { EventMeetingMode, EventPaymentGateway } from "@/types/database";

export interface PublicEventRegistrationState {
  error?: string;
  success?: boolean;
  // Set instead of `success` when the event requires payment before the
  // pass is sent — the client renders a payment step (the organizer's
  // external link, or the platform's Razorpay checkout) instead of the
  // normal "you're registered" state.
  paymentRequired?: boolean;
  registrationId?: string;
  paymentGateway?: EventPaymentGateway;
  paymentAmount?: number;
  externalPaymentUrl?: string | null;
}

// Shared by two callers: registerForEvent below (immediately, when
// payment isn't required or is collected later at check-in) and both
// payment-confirmation paths — markRegistrationPaid
// (src/lib/events/registration-actions.ts) and
// finalizeEventRegistrationPayment (src/lib/events/razorpay-registration.ts)
// — once a "before_registration" registration's payment actually clears.
// Best-effort: a failure here is logged inside sendRegistrationPassEmail
// itself and never thrown, so it never undoes the registration/payment
// that already committed.
export async function sendPassEmailForRegistration(registrationId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("event_registrations")
    .select(
      "email, answers, event_id, confirmation_code, events(title, description, start_at, end_at, meeting_mode, meeting_link, venue, map_link, contact_name, contact_phone, organization_id, registration_pass_color, registration_pass_message, registration_pass_background_url, branches(name), organizations(name))",
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) return;

  const event = registration.events as {
    title: string;
    description: string | null;
    start_at: string;
    end_at: string | null;
    meeting_mode: EventMeetingMode;
    meeting_link: string | null;
    venue: string | null;
    map_link: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    organization_id: string;
    registration_pass_color: string;
    registration_pass_message: string | null;
    registration_pass_background_url: string | null;
    branches: { name: string } | null;
    organizations: { name: string } | null;
  } | null;

  if (!event) return;

  const venueLabel = eventVenueLabel({ meeting_mode: event.meeting_mode, venue: event.venue, branchName: event.branches?.name });
  const joinLink = eventJoinLink(event);

  const answersRecord = registration.answers as Record<string, unknown>;
  const recipientName = typeof answersRecord.name === "string" ? answersRecord.name : null;

  await sendRegistrationPassEmail({
    organizationId: event.organization_id,
    organizationName: event.organizations?.name ?? "Your church",
    to: registration.email,
    recipientName,
    eventId: registration.event_id,
    eventTitle: event.title,
    eventDescription: event.description,
    startAt: event.start_at,
    endAt: event.end_at,
    venueLabel,
    mapLink: event.map_link,
    joinLink,
    contactName: event.contact_name,
    contactPhone: event.contact_phone,
    confirmationCode: registration.confirmation_code,
    passColor: event.registration_pass_color,
    passMessage: event.registration_pass_message,
    backgroundUrl: event.registration_pass_background_url,
  });
}

// Anonymous visitor submission from the public /events/register/[token]
// page — no requireUser(), field validation happens server-side in the
// submit_event_registration RPC, same shape as submitPublicForm/
// submitWidgetResponse. The registration row is always created
// immediately (payment or not — see migration 0105's RPC update); what
// differs is only whether the pass email goes out now or is withheld
// until payment clears.
export async function registerForEvent(
  token: string,
  _prevState: PublicEventRegistrationState,
  formData: FormData,
): Promise<PublicEventRegistrationState> {
  const fieldKeys = String(formData.get("__fieldKeys") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const checkboxKeys = new Set(
    String(formData.get("__checkboxKeys") ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );

  const answers: Record<string, string | boolean> = {};
  for (const key of fieldKeys) {
    if (checkboxKeys.has(key)) {
      answers[key] = formData.get(key) === "on";
      continue;
    }
    const raw = formData.get(key);
    if (raw !== null) {
      const value = String(raw).trim();
      if (value) answers[key] = value;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_event_registration", { token, answers }).maybeSingle();

  if (error) {
    return { error: error.message || "Couldn't complete your registration. Please try again." };
  }
  if (!data) {
    return { error: "Couldn't complete your registration. Please try again." };
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("payment_required, payment_gateway, payment_amount, external_payment_url, payment_timing")
    .eq("registration_share_token", token)
    .maybeSingle();

  const paymentPending = Boolean(event?.payment_required) && event?.payment_timing === "before_registration";

  if (paymentPending) {
    return {
      paymentRequired: true,
      registrationId: data.registration_id,
      paymentGateway: event?.payment_gateway ?? undefined,
      paymentAmount: event?.payment_amount ?? undefined,
      externalPaymentUrl: event?.external_payment_url,
    };
  }

  // Either payment isn't required, or it's collected later at check-in —
  // either way, the pass goes out now. For "at check-in", the amount/
  // gateway/link are still passed back so the success screen can remind
  // the visitor what (and how) they still owe.
  await sendPassEmailForRegistration(data.registration_id);

  if (event?.payment_required && event.payment_timing === "at_checkin") {
    return {
      success: true,
      paymentAmount: event.payment_amount ?? undefined,
      paymentGateway: event.payment_gateway ?? undefined,
      externalPaymentUrl: event.external_payment_url,
    };
  }

  return { success: true };
}
