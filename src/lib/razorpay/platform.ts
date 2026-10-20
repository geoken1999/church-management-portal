import "server-only";

import crypto from "node:crypto";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { getRazorpayEnv } from "@/lib/billing/env";
import { toPaise, type RazorpayCheckout } from "@/lib/razorpay/checkout";

// One-time payments on KingdomFlow's own Razorpay account.
//
// The shape of every flow: the server writes its own order row under a reference of its own (the "txnid"),
// creates a Razorpay order whose `receipt` IS that reference, and the browser pays it. When the payment
// succeeds Razorpay sends the browser back to a return route with razorpay_order_id, razorpay_payment_id and
// razorpay_signature. The route calls confirmReturn, which checks the signature and asks Razorpay itself
// (server to server) which order and payment those are, and hands back the reference so the flow's own
// finalize function can run. Nothing in the browser's word is trusted.

export interface CreateCheckoutInput {
  /** Our own reference for this payment; comes back as the order's receipt. At most 40 characters. */
  receipt: string;
  amountRupees: number;
  name: string;
  description: string;
  prefill?: RazorpayCheckout["prefill"];
  callbackUrl: string;
  notes?: Record<string, string>;
}

export async function createCheckout(
  input: CreateCheckoutInput,
): Promise<RazorpayCheckout> {
  const { keyId } = getRazorpayEnv();
  const order = await createRazorpayClient().orders.create({
    amount: toPaise(input.amountRupees),
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
  return {
    keyId,
    orderId: order.id,
    amountPaise: toPaise(input.amountRupees),
    currency: "INR",
    name: input.name,
    description: input.description,
    prefill: input.prefill ?? {},
    callbackUrl: input.callbackUrl,
  };
}

/** Razorpay's documented check: HMAC-SHA256 of "order_id|payment_id" with the account's key secret. */
export function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The few Razorpay calls confirmReturn makes, so tests can stand in for Razorpay. */
export interface RazorpayLookup {
  fetchOrder(
    orderId: string,
  ): Promise<{ id: string; receipt: string | null; amount: number }>;
  fetchPayment(
    paymentId: string,
  ): Promise<{
    id: string;
    order_id: string | null;
    status: string;
    amount: number;
  }>;
  capturePayment(paymentId: string, amountPaise: number): Promise<void>;
}

const liveLookup = (): RazorpayLookup => {
  const client = createRazorpayClient();
  return {
    fetchOrder: async (id) => {
      const o = await client.orders.fetch(id);
      return { id: o.id, receipt: o.receipt ?? null, amount: Number(o.amount) };
    },
    fetchPayment: async (id) => {
      const p = await client.payments.fetch(id);
      return {
        id: p.id,
        order_id: p.order_id ?? null,
        status: String(p.status),
        amount: Number(p.amount),
      };
    },
    capturePayment: async (id, amount) => {
      await client.payments.capture(id, amount, "INR");
    },
  };
};

export type ReturnOutcome =
  | { ok: true; reference: string; paymentId: string }
  | {
      ok: false;
      reason: "bad_request" | "declined" | "unverified" | "pending";
    };

/**
 * Checks what Razorpay sent the browser back with. `ok` only when the signature is right, the payment really
 * belongs to that order, and the money is captured (an authorized payment is captured here, once).
 */
export async function confirmReturn(
  form: { get(name: string): FormDataEntryValue | null },
  keySecret: string = getRazorpayEnv().keySecret,
  lookup: RazorpayLookup = liveLookup(),
): Promise<ReturnOutcome> {
  const text = (name: string) => String(form.get(name) ?? "");
  const orderId = text("razorpay_order_id");
  const paymentId = text("razorpay_payment_id");
  const signature = text("razorpay_signature");
  // A failed or abandoned payment comes back with error fields and no signature.
  if (!paymentId && !signature) return { ok: false, reason: "declined" };
  if (!orderId || !paymentId || !signature)
    return { ok: false, reason: "bad_request" };
  if (!verifySignature(orderId, paymentId, signature, keySecret))
    return { ok: false, reason: "unverified" };

  const [order, payment] = await Promise.all([
    lookup.fetchOrder(orderId),
    lookup.fetchPayment(paymentId),
  ]);
  if (payment.order_id !== order.id || !order.receipt)
    return { ok: false, reason: "unverified" };
  if (payment.status === "authorized") {
    await lookup.capturePayment(paymentId, payment.amount);
    return { ok: true, reference: order.receipt, paymentId };
  }
  if (payment.status === "captured")
    return { ok: true, reference: order.receipt, paymentId };
  return {
    ok: false,
    reason: payment.status === "failed" ? "declined" : "pending",
  };
}
