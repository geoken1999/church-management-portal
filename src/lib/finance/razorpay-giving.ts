import "server-only";

import crypto from "node:crypto";
import { Razorpay } from "@/lib/billing/razorpay";
import { getRazorpayEnv } from "@/lib/billing/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FundraiserPaymentMode } from "@/types/database";

export interface GivingCredentials {
  keyId: string;
  keySecret: string;
}

// 'shared' always uses the platform's own account (RAZORPAY_KEY_ID/SECRET
// — the same one used for subscription billing). 'own' looks up the
// organization's own stored credentials — callers must have already
// confirmed a row exists (updateFundraiserPaymentSettings won't let a
// fundraiser switch to 'own' mode without one).
export async function getGivingCredentials(
  organizationId: string,
  paymentMode: FundraiserPaymentMode,
): Promise<GivingCredentials | null> {
  if (paymentMode === "shared") {
    const { keyId, keySecret } = getRazorpayEnv();
    return { keyId, keySecret };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_razorpay_accounts")
    .select("key_id, key_secret")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  return { keyId: data.key_id, keySecret: data.key_secret };
}

export function createGivingRazorpayClient(credentials: GivingCredentials): Razorpay {
  return new Razorpay({ key_id: credentials.keyId, key_secret: credentials.keySecret });
}

// Razorpay Checkout's client-side success handler returns
// (order_id, payment_id, signature) — this is the standard verification
// recipe from Razorpay's own docs (HMAC-SHA256 of "order_id|payment_id"
// using the account's key_secret). The SDK doesn't expose this as a public
// helper in the installed version, so it's implemented directly rather
// than reaching into the package's internal utils module.
export function verifyGivingPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected === signature;
}

export interface FinalizeGivingOrderResult {
  error?: string;
  success?: boolean;
}

// Shared by both confirmation paths: the Checkout success callback
// (confirmGivingPayment, which verifies the order/payment HMAC first) and
// the Razorpay webhook (which has already verified its own, differently-
// keyed webhook signature) — whichever fires first wins, and the other is
// a no-op thanks to the donation_id idempotency check below. Only ever
// reachable for 'shared' mode from the webhook, since 'own' mode orders
// are created against a different Razorpay account with no webhook
// pointed at this app.
export async function finalizeGivingOrderPayment(razorpayOrderId: string, razorpayPaymentId: string): Promise<FinalizeGivingOrderResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("fundraiser_payment_orders")
    .select("id, organization_id, fundraiser_id, amount, payment_mode, donor_name, status, donation_id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  if (order.status === "paid" && order.donation_id) {
    return { success: true };
  }

  // Atomic claim: this UPDATE only matches (and only one concurrent call
  // can win it) while the row is still 'created'. The checkout callback
  // and the webhook can both fire for the same payment at nearly the same
  // time — without this, both could pass the check above and each insert
  // its own donation for the same payment.
  const { data: claimed } = await admin
    .from("fundraiser_payment_orders")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId })
    .eq("id", order.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Lost the race (or already claimed earlier) — the other caller is
    // handling (or already handled) the donation.
    return { success: true };
  }

  const { data: donation, error: donationError } = await admin
    .from("donations")
    .insert({
      organization_id: order.organization_id,
      fundraiser_id: order.fundraiser_id,
      amount: order.amount,
      donated_on: new Date().toISOString().slice(0, 10),
      method: "online",
      payment_mode: order.payment_mode,
      donor_name: order.donor_name,
      notes: `Online gift via ${order.payment_mode === "own" ? "the church's" : "KingdomFlow's shared"} Razorpay account.`,
    })
    .select("id")
    .single();

  if (donationError || !donation) {
    console.error("fundraiser giving donation insert failed:", donationError?.message);
    return { error: "Payment succeeded but couldn't be recorded. Please contact the church directly." };
  }

  await admin.from("fundraiser_payment_orders").update({ donation_id: donation.id }).eq("id", order.id);

  return { success: true };
}
