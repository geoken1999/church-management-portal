import { NextResponse } from "next/server";
import { Razorpay } from "@/lib/billing/razorpay";
import { getRazorpayWebhookSecret } from "@/lib/billing/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeGivingOrderPayment } from "@/lib/finance/razorpay-giving";
import { finalizeAddonOrderPayment } from "@/lib/billing/addon-actions";
import { logPlatformEvent } from "@/lib/platform-events/log";

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

  // Backup confirmation path for 'shared'-mode fundraiser giving — this
  // webhook is on the platform's own Razorpay account, the same one
  // 'shared' mode uses, so its events cover those payments too. 'own'
  // mode orders are created against a different (the church's own)
  // account, which has no webhook pointed at this app, so they rely on
  // the Checkout success callback alone (see confirmGivingPayment). The
  // callback is normally faster; this just catches it if the browser
  // closed before that callback fired.
  if (event === "payment.captured" && paymentEntity?.notes?.kind === "fundraiser_giving" && paymentEntity.order_id) {
    await finalizeGivingOrderPayment(paymentEntity.order_id, paymentEntity.id);
    return NextResponse.json({ ok: true });
  }

  // Backup confirmation path for add-on pack purchases, same reasoning as
  // fundraiser_giving above — these are always on the platform's own
  // account, so this webhook covers them too.
  if (event === "payment.captured" && paymentEntity?.notes?.kind === "addon_purchase" && paymentEntity.order_id) {
    await finalizeAddonOrderPayment(paymentEntity.order_id, paymentEntity.id);
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
    .select("organization_id, plan_id")
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

  if (event === "subscription.activated" || event === "subscription.charged") {
    await admin.from("organizations").update({ plan: existing.plan_id }).eq("id", existing.organization_id);
  } else if (["subscription.cancelled", "subscription.completed", "subscription.expired"].includes(event)) {
    // Basic is the floor plan everyone falls back to — there's no
    // free/suspended tier below it yet.
    await admin.from("organizations").update({ plan: "basic" }).eq("id", existing.organization_id);
  }

  return NextResponse.json({ ok: true });
}
