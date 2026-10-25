import { NextResponse } from "next/server";
import { Razorpay } from "@/lib/billing/razorpay";
import { getRazorpayWebhookSecret } from "@/lib/billing/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendSubscriptionChargedEmail,
  sendSubscriptionPaymentFailedEmail,
} from "@/lib/billing/receipts";
import {
  activateRazorpaySubscription,
  recordSubscriptionCharge,
} from "@/lib/billing/razorpay-subscription";
import {
  finishScheduledCancellation,
  planNameFor,
} from "@/lib/billing/cancellation-store";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { handleModuleSubscriptionEvent } from "@/lib/billing/modules";
import { finalizeAddonOrderPayment } from "@/lib/billing/addon-actions";
import { finalizeEventRegistrationPayment } from "@/lib/events/registration-payment";
import { finalizeMembershipPayment } from "@/lib/membership-fees/finalize";
import { finalizeProgramPayment } from "@/lib/lms/payments";
import { finalizePayUGivingOrderPayment } from "@/lib/finance/payu-giving";

// The source of truth for plan changes — startSubscriptionCheckout's DB
// write only records what checkout was *started*; this is what confirms
// Razorpay actually authorized/charged/cancelled it, since the client-side
// checkout callback alone could be spoofed or interrupted.
//
// Signature verification needs the exact raw request bytes (Razorpay signs
// the literal body string), so the body is read as text before any JSON
// parsing — request.json() would have already consumed/reformatted it.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = getRazorpayWebhookSecret();
  } catch {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  if (!Razorpay.validateWebhookSignature(rawBody, signature, secret)) {
    await logPlatformEvent({
      level: "warning",
      source: "razorpay_webhook",
      message: "Invalid Razorpay webhook signature",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const payload = JSON.parse(rawBody);
  const event: string = payload.event ?? "";
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const paymentEntity = payload.payload?.payment?.entity;

  // One-time payments (add-ons, event registrations, membership fees, Bible School programs, shared-mode
  // giving) normally finish on the browser's return route. This is the safety net for a person who paid
  // and closed the page before it loaded: the same idempotent finalizers run from Razorpay's own word.
  if (event === "order.paid") {
    const receipt: string = payload.payload?.order?.entity?.receipt ?? "";
    const paymentId: string = paymentEntity?.id ?? "";
    if (receipt && paymentId) {
      try {
        const error = await finalizeByReceipt(receipt, paymentId);
        if (error)
          await logPlatformEvent({
            level: "error",
            source: "razorpay_webhook",
            message: `order.paid for ${receipt} could not be finalized: ${error}`,
            metadata: { receipt, paymentId },
          });
      } catch (err) {
        await logPlatformEvent({
          level: "error",
          source: "razorpay_webhook",
          message: `order.paid for ${receipt} failed: ${err instanceof Error ? err.message : "unknown error"}`,
          metadata: { receipt, paymentId },
        });
        // A 500 makes Razorpay retry the event.
        return NextResponse.json({ error: "Finalize failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (!subscriptionEntity?.id) {
    // A payment/refund/other event this app doesn't act on — ack so
    // Razorpay doesn't retry it.
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("organization_subscriptions")
    .select(
      "id, organization_id, plan_id, billing_interval, status, monthly_amount, cancel_at_period_end",
    )
    .eq("razorpay_subscription_id", subscriptionEntity.id)
    .maybeSingle();

  if (!existing) {
    // A module a church subscribed to on its own is a subscription of its own.
    const { data: moduleRow } = await admin
      .from("organization_module_subscriptions")
      .select("id, organization_id, module_key, status, monthly_amount")
      .eq("razorpay_subscription_id", subscriptionEntity.id)
      .maybeSingle();
    if (moduleRow) {
      try {
        await handleModuleSubscriptionEvent({ event, entity: subscriptionEntity, payment: paymentEntity, row: moduleRow });
      } catch (err) {
        await logPlatformEvent({
          level: "error",
          source: "razorpay_webhook",
          message: `${event} for a module could not be processed: ${err instanceof Error ? err.message : "unknown error"}`,
          organizationId: moduleRow.organization_id,
          metadata: { subscriptionId: subscriptionEntity.id, moduleKey: moduleRow.module_key },
        });
        // A 500 makes Razorpay retry the event.
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }
    // A subscription Razorpay knows about that this app didn't create
    // (e.g. set up directly in the Dashboard) — nothing here to reconcile.
    return NextResponse.json({ ok: true });
  }

  const toIso = (unixSeconds: number | null | undefined): string | null =>
    unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
  const planName = planNameFor(existing.plan_id, existing.monthly_amount);
  const ended = [
    "subscription.cancelled",
    "subscription.completed",
    "subscription.expired",
  ].includes(event);

  try {
    // The plan switches on once the church has authorised (or the first charge lands).
    if (
      event === "subscription.activated" ||
      event === "subscription.charged"
    ) {
      await activateRazorpaySubscription(
        subscriptionEntity.id,
        subscriptionEntity,
      );
    }

    if (ended) {
      // A subscription already closed on our side (the church cancelled a not-yet-live one, or an earlier
      // delivery of this event) needs nothing more.
      if (existing.status !== "cancelled") {
        await finishScheduledCancellation({
          id: existing.id,
          organization_id: existing.organization_id,
          plan_id: existing.plan_id,
          monthly_amount:
            existing.monthly_amount !== null
              ? Number(existing.monthly_amount)
              : null,
        });
      }
    } else if (!(
      event === "subscription.authenticated" && existing.status === "active"
    )) {
      // Keeps our copy of Razorpay's state current: status, customer, the period and the next charge date.
      await admin
        .from("organization_subscriptions")
        .update({
          status: subscriptionEntity.status,
          razorpay_customer_id: subscriptionEntity.customer_id ?? undefined,
          current_start: toIso(subscriptionEntity.current_start),
          current_end: toIso(subscriptionEntity.current_end),
          next_charge_at: toIso(subscriptionEntity.charge_at),
        })
        .eq("id", existing.id);
    }

    if (
      event === "subscription.charged" &&
      paymentEntity?.id &&
      paymentEntity.amount > 0
    ) {
      const first = await recordSubscriptionCharge({
        subscriptionRowId: existing.id,
        organizationId: existing.organization_id,
        planId: existing.plan_id,
        interval: existing.billing_interval === "annual" ? "annual" : "monthly",
        monthlyAmount:
          existing.monthly_amount !== null
            ? Number(existing.monthly_amount)
            : null,
        razorpaySubscriptionId: subscriptionEntity.id,
        paymentId: paymentEntity.id,
        amountPaise: paymentEntity.amount,
        paidAt: toIso(paymentEntity.created_at) ?? new Date().toISOString(),
        raw: paymentEntity,
      });
      if (first)
        await sendSubscriptionChargedEmail(
          existing.organization_id,
          planName,
          paymentEntity.amount,
        );
    }

    if (event === "subscription.halted") {
      // Razorpay gave up retrying: back to the free floor plan until the church authorises again.
      await admin
        .from("organizations")
        .update({ plan: "basic" })
        .eq("id", existing.organization_id);
      await sendSubscriptionPaymentFailedEmail(
        existing.organization_id,
        planName,
        false,
      );
    } else if (event === "subscription.pending") {
      await sendSubscriptionPaymentFailedEmail(
        existing.organization_id,
        planName,
        true,
      );
    }
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "razorpay_webhook",
      message: `${event} could not be processed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: existing.organization_id,
      metadata: { subscriptionId: subscriptionEntity.id },
    });
    // A 500 makes Razorpay retry the event.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// The reference each flow puts on its Razorpay order starts with the flow's own prefix. Returns an error
// message, or null when done (finalizers are idempotent, so a payment the return route already handled is
// a no-op here).
async function finalizeByReceipt(
  receipt: string,
  paymentId: string,
): Promise<string | null> {
  const run = async (fn: () => Promise<{ error?: string }>) =>
    (await fn()).error ?? null;
  if (receipt.startsWith("addon"))
    return run(() => finalizeAddonOrderPayment(receipt, paymentId));
  if (receipt.startsWith("evreg"))
    return run(() => finalizeEventRegistrationPayment(receipt, paymentId));
  if (receipt.startsWith("mship"))
    return run(() => finalizeMembershipPayment(receipt, paymentId));
  if (receipt.startsWith("lms"))
    return run(() => finalizeProgramPayment(receipt, paymentId));
  if (receipt.startsWith("giving"))
    return run(() => finalizePayUGivingOrderPayment(receipt, paymentId));
  return null;
}
