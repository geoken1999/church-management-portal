"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanUsage } from "@/lib/plans/dal";
import { buildPaymentRequestFields, type PayUFormFields } from "@/lib/payu/client";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sendPassEmailForRegistration } from "@/lib/events/public-registration-actions";

// Event registration only ever uses the platform's own shared PayU
// account — unlike fundraiser giving, there's no "organizer's own gateway
// keys" sub-option here (that wasn't asked for; the two gateway choices
// are "our gateway" vs. "your own external link", not a choice of whose
// account). buildPaymentRequestFields/verifyPayUReturn (src/lib/payu/
// client.ts) are generic over any one-time payment, so they're reused
// directly here rather than duplicated.

export interface CreateEventRegistrationOrderState {
  error?: string;
  payuFields?: PayUFormFields;
  payuActionUrl?: string;
  amount?: number;
  organizationName?: string;
  eventTitle?: string;
}

// Called from the public registration page right after a "before_registration"
// registration is created — the registration row already exists by this
// point (see registerForEvent in public-registration-actions.ts), so the
// order is attached to a real registration_id from the start. Also called
// again if an earlier payment attempt failed, to retry without re-creating
// the registration.
export async function createEventRegistrationOrder(registrationId: string): Promise<CreateEventRegistrationOrderState> {
  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("event_registrations")
    .select("id, organization_id, event_id, email, payment_status, payment_amount, events(title, payment_required, payment_gateway, organizations(name))")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) return { error: "That registration could not be found." };
  if (registration.payment_status === "paid") return { error: "This registration has already been paid for." };

  const event = registration.events as {
    title: string;
    payment_required: boolean;
    payment_gateway: string | null;
    organizations: { name: string } | null;
  } | null;
  if (!event || !event.payment_required || event.payment_gateway !== "platform") {
    return { error: "This event doesn't use online payment." };
  }

  // Re-checked live, same defensive reasoning as createGivingOrder's own
  // re-check — the org's plan can change between when the event was set
  // up and when this visitor registers.
  const { plan } = await getPlanUsage(registration.organization_id);
  if (!plan.financeEnabled) {
    return { error: "Online payment is temporarily unavailable for this event." };
  }

  const amount = registration.payment_amount;
  if (!amount || amount <= 0) {
    return { error: "This event doesn't have a valid payment amount set." };
  }

  const txnid = `evreg${Date.now()}${registration.id.replace(/-/g, "").slice(0, 8)}`;
  const { error: insertError } = await admin.from("event_registration_payment_orders").insert({
    organization_id: registration.organization_id,
    event_id: registration.event_id,
    registration_id: registration.id,
    payu_txnid: txnid,
    amount,
  });

  if (insertError) {
    console.error("event_registration_payment_orders insert failed:", insertError.message);
    return { error: "Couldn't start the payment. Please try again." };
  }

  const siteUrl = getSiteUrl();
  const returnUrl = `${siteUrl}/api/payu/event-registration/return?eventId=${registration.event_id}&registrationId=${registration.id}`;

  let built;
  try {
    built = buildPaymentRequestFields({
      txnid,
      amountRupees: amount,
      productinfo: `Registration: ${event.title}`,
      firstname: "Registrant",
      email: registration.email,
      phone: "9999999999",
      surl: returnUrl,
      furl: returnUrl,
      udf1: `evreg:${registration.id}`,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "event_registration_payment",
      message: `PayU field build failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: registration.organization_id,
      metadata: { registrationId: registration.id, txnid },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    payuFields: built.fields,
    payuActionUrl: built.actionUrl,
    amount,
    organizationName: event.organizations?.name ?? "",
    eventTitle: event.title,
  };
}

export interface FinalizeEventRegistrationPaymentResult {
  error?: string;
  success?: boolean;
}

// Called only from the PayU return route (/api/payu/event-registration/
// return), after that route has verified PayU's hash — this function
// itself does no verification. Same atomic paid-once claim as before: the
// status 'created' -> 'paid' UPDATE only matches once, so a redelivered
// callback can't mark the registration paid twice or send the pass email
// twice.
export async function finalizeEventRegistrationPayment(txnid: string, mihpayid: string): Promise<FinalizeEventRegistrationPaymentResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("event_registration_payment_orders")
    .select("id, registration_id, status, events(payment_timing)")
    .eq("payu_txnid", txnid)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  if (order.status === "paid") {
    return { success: true };
  }

  const { data: claimed } = await admin
    .from("event_registration_payment_orders")
    .update({ status: "paid", payu_mihpayid: mihpayid })
    .eq("id", order.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { success: true };
  }

  await admin
    .from("event_registrations")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", order.registration_id);

  const event = order.events as { payment_timing: string | null } | null;
  if (event?.payment_timing === "before_registration" || event?.payment_timing === "both") {
    await sendPassEmailForRegistration(order.registration_id);
  }

  return { success: true };
}
