"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanUsage } from "@/lib/plans/dal";
import { getGivingCredentials, createGivingRazorpayClient, verifyGivingPaymentSignature } from "@/lib/finance/razorpay-giving";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sendPassEmailForRegistration } from "@/lib/events/public-registration-actions";

// Event registration only ever uses the platform's own shared Razorpay
// account — unlike fundraiser giving, there's no "organizer's own
// Razorpay keys" sub-option here (that wasn't asked for; the two gateway
// choices are "our gateway" vs. "your own external link", not a choice of
// whose Razorpay account). getGivingCredentials/createGivingRazorpayClient/
// verifyGivingPaymentSignature (src/lib/finance/razorpay-giving.ts) are
// already generic over organizationId + mode, so they're reused directly
// rather than duplicated.

export interface CreateEventRegistrationOrderState {
  error?: string;
  orderId?: string;
  keyId?: string;
  amount?: number;
  organizationName?: string;
  eventTitle?: string;
}

// Called from the public registration page right after a "before_registration"
// registration is created — the registration row already exists by this
// point (see registerForEvent in public-registration-actions.ts), so the
// order is attached to a real registration_id from the start, unlike
// fundraiser giving where the donation doesn't exist until payment clears.
export async function createEventRegistrationOrder(registrationId: string): Promise<CreateEventRegistrationOrderState> {
  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("event_registrations")
    .select("id, organization_id, event_id, payment_status, payment_amount, events(title, payment_required, payment_gateway, organizations(name))")
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

  const credentials = await getGivingCredentials(registration.organization_id, "shared");
  if (!credentials) {
    return { error: "Online payment isn't set up correctly yet. Please try again later." };
  }

  const amount = registration.payment_amount;
  if (!amount || amount <= 0) {
    return { error: "This event doesn't have a valid payment amount set." };
  }

  let order;
  try {
    const client = createGivingRazorpayClient(credentials);
    order = await client.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `evreg_${registration.id}_${Date.now()}`,
      notes: {
        kind: "event_registration",
        registration_id: registration.id,
        event_id: registration.event_id,
        organization_id: registration.organization_id,
      },
    });
  } catch (err) {
    console.error("event registration order creation failed:", err);
    await logPlatformEvent({
      level: "error",
      source: "event_registration_payment",
      message: `Razorpay order creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: registration.organization_id,
      metadata: { registrationId: registration.id },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  const { error: insertError } = await admin.from("event_registration_payment_orders").insert({
    organization_id: registration.organization_id,
    event_id: registration.event_id,
    registration_id: registration.id,
    razorpay_order_id: order.id,
    amount,
  });

  if (insertError) {
    console.error("event_registration_payment_orders insert failed:", insertError.message);
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    orderId: order.id,
    keyId: credentials.keyId,
    amount,
    organizationName: event.organizations?.name ?? "",
    eventTitle: event.title,
  };
}

export interface ConfirmEventRegistrationPaymentState {
  error?: string;
  success?: boolean;
}

export async function confirmEventRegistrationPayment(
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<ConfirmEventRegistrationPaymentState> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("event_registration_payment_orders")
    .select("organization_id")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  const credentials = await getGivingCredentials(order.organization_id, "shared");
  if (!credentials) {
    return { error: "Couldn't verify this payment. Please contact the church directly." };
  }

  if (!verifyGivingPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return { error: "Couldn't verify this payment." };
  }

  return finalizeEventRegistrationPayment(orderId, paymentId);
}

export interface FinalizeEventRegistrationPaymentResult {
  error?: string;
  success?: boolean;
}

// Shared by both confirmation paths: the Checkout success callback
// (confirmEventRegistrationPayment, which verifies the HMAC first) and
// the Razorpay webhook (already verified via its own, differently-keyed
// webhook signature) — whichever fires first wins; the other is a no-op
// thanks to the atomic claim below. Same race-safety pattern as
// finalizeGivingOrderPayment in src/lib/finance/razorpay-giving.ts.
export async function finalizeEventRegistrationPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<FinalizeEventRegistrationPaymentResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("event_registration_payment_orders")
    .select("id, registration_id, status, events(payment_timing)")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  if (order.status === "paid") {
    return { success: true };
  }

  // Atomic claim: only one concurrent caller can win this UPDATE while the
  // row is still 'created' — the checkout callback and the webhook can
  // both fire for the same payment nearly simultaneously.
  const { data: claimed } = await admin
    .from("event_registration_payment_orders")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId })
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
