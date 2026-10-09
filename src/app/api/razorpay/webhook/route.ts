import { NextResponse } from "next/server";
import { Razorpay } from "@/lib/billing/razorpay";
import { getRazorpayWebhookSecret } from "@/lib/billing/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSubscriptionActivatedEmail, sendSubscriptionChargedEmail, sendSubscriptionCancelledEmail } from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { PLANS, isPlanId, isBillingInterval } from "@/lib/plans/config";

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
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  if (!Razorpay.validateWebhookSignature(rawBody, signature, secret)) {
    await logPlatformEvent({ level: "warning", source: "razorpay_webhook", message: "Invalid Razorpay webhook signature" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const payload = JSON.parse(rawBody);
  const event: string = payload.event ?? "";
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const paymentEntity = payload.payload?.payment?.entity;

  // 'shared'-mode fundraiser giving moved to PayU — see
  // /api/payu/giving/return. 'own' mode (a church's own Razorpay keys)
  // still relies solely on the Checkout success callback (see
  // confirmGivingPayment in giving-actions.ts), unchanged — it was never
  // covered by this webhook in the first place, since it runs against a
  // different (the church's own) Razorpay account with no webhook pointed
  // at this app.

  // Add-on pack purchases moved to PayU — see /api/payu/addon/return. PayU
  // has no equivalent of this Razorpay webhook event, so there's no branch
  // for it here anymore.

  // Monthly membership fees moved to PayU — see
  // /api/payu/membership/return. No branch for it here anymore.

  // Paid event registration moved to PayU — see
  // /api/payu/event-registration/return. No branch for it here anymore.

  if (!subscriptionEntity?.id) {
    // A payment/refund/other event this app doesn't act on — ack so
    // Razorpay doesn't retry it.
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("organization_subscriptions")
    .select("organization_id, plan_id, billing_interval")
    .eq("razorpay_subscription_id", subscriptionEntity.id)
    .maybeSingle();

  if (!existing) {
    // A subscription Razorpay knows about that this app didn't create
    // (e.g. set up directly in the Dashboard) — nothing here to reconcile.
    return NextResponse.json({ ok: true });
  }

  const toIso = (unixSeconds: number | null | undefined): string | null =>
    unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

  await admin
    .from("organization_subscriptions")
    .update({
      status: subscriptionEntity.status,
      razorpay_customer_id: subscriptionEntity.customer_id ?? undefined,
      current_start: toIso(subscriptionEntity.current_start),
      current_end: toIso(subscriptionEntity.current_end),
    })
    .eq("razorpay_subscription_id", subscriptionEntity.id);

  const planName = isPlanId(existing.plan_id) ? PLANS[existing.plan_id].name : existing.plan_id;

  // Record what the platform actually collected for this charge. Razorpay
  // reports amounts in paise. Keyed on the payment id, so a redelivered
  // webhook doesn't count the same charge twice.
  if (event === "subscription.charged" && paymentEntity?.id && paymentEntity.amount > 0) {
    await admin.from("platform_subscription_payments").upsert(
      {
        organization_id: existing.organization_id,
        razorpay_subscription_id: subscriptionEntity.id,
        razorpay_payment_id: paymentEntity.id,
        plan_id: existing.plan_id,
        amount: paymentEntity.amount / 100,
        currency: paymentEntity.currency ?? "INR",
        paid_at: toIso(paymentEntity.created_at) ?? new Date().toISOString(),
      },
      { onConflict: "razorpay_payment_id", ignoreDuplicates: true },
    );
  }

  if (event === "subscription.activated" || event === "subscription.charged") {
    await admin.from("organizations").update({ plan: existing.plan_id }).eq("id", existing.organization_id);

    if (event === "subscription.activated") {
      const interval = isBillingInterval(existing.billing_interval) ? existing.billing_interval : "monthly";
      await sendSubscriptionActivatedEmail(existing.organization_id, planName, interval);
    } else {
      await sendSubscriptionChargedEmail(existing.organization_id, planName, paymentEntity?.amount ?? null);
    }
  } else if (["subscription.cancelled", "subscription.completed", "subscription.expired"].includes(event)) {
    // Basic is the floor plan everyone falls back to — there's no
    // free/suspended tier below it yet.
    await admin.from("organizations").update({ plan: "basic" }).eq("id", existing.organization_id);
    await sendSubscriptionCancelledEmail(existing.organization_id, planName);
  }

  return NextResponse.json({ ok: true });
}
