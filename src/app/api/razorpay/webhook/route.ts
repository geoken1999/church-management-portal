import { NextResponse } from "next/server";
import { Razorpay } from "@/lib/billing/razorpay";
import { getRazorpayWebhookSecret } from "@/lib/billing/env";
import { createAdminClient } from "@/lib/supabase/admin";

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
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const payload = JSON.parse(rawBody);
  const event: string = payload.event ?? "";
  const subscriptionEntity = payload.payload?.subscription?.entity;

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
