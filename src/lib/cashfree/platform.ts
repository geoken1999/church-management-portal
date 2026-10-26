import "server-only";

import crypto from "node:crypto";
import { createCashfreeOrder, getCashfreeOrderStatus, getCashfreeSuccessfulPaymentId, type CashfreeCredentials } from "@/lib/cashfree/client";
import type { CreateCheckoutInput, ReturnOutcome } from "@/lib/razorpay/platform";
import type { RazorpayCheckout } from "@/lib/razorpay/checkout";

// KingdomFlow's own Cashfree account: the backup for the one-time payments that normally go through its Razorpay
// account (gifts, paid events, membership fees, course fees, add-on packs). The shape matches the Razorpay side:
// our own reference for the payment becomes Cashfree's order id, the browser pays it, Cashfree sends the browser to
// the same return route (as a GET with ?order_id=), and the route asks Cashfree itself whether that order is paid
// before anything is credited. Nothing in the browser's word is trusted.

export function getPlatformCashfreeCredentials(): CashfreeCredentials | null {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) return null;
  return { appId, secretKey, environment: process.env.CASHFREE_ENV === "test" ? "test" : "live" };
}

export const isPlatformCashfreeConfigured = (): boolean => getPlatformCashfreeCredentials() !== null;

// Cashfree order ids allow letters, digits, underscore and hyphen, up to 50 characters. Our references already are
// that; one that isn't is refused rather than altered, because the reference must come back unchanged.
const ORDER_ID = /^[A-Za-z0-9_-]{1,50}$/;

/** The callback address with Cashfree's `{order_id}` placeholder added, which Cashfree fills in on the way back. */
export function cashfreeReturnUrl(callbackUrl: string): string {
  return `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}order_id={order_id}`;
}

export async function createPlatformCashfreeCheckout(input: CreateCheckoutInput): Promise<RazorpayCheckout> {
  const creds = getPlatformCashfreeCredentials();
  if (!creds) throw new Error("Cashfree isn't configured.");
  const orderId = input.receipt.slice(0, 40);
  if (!ORDER_ID.test(orderId)) throw new Error("This payment reference can't be used as a Cashfree order id.");

  const created = await createCashfreeOrder(creds, {
    orderId,
    amount: input.amountRupees,
    customerId: `c_${orderId}`.slice(0, 50),
    customerName: input.prefill?.name?.trim() || "Customer",
    customerEmail: input.prefill?.email?.trim() || `no-reply+${orderId}@kingdomflow.app`,
    customerPhone: (input.prefill?.contact ?? "").replace(/\D/g, "").slice(-10).padStart(10, "9"),
    returnUrl: cashfreeReturnUrl(input.callbackUrl),
    note: input.description,
  });
  if ("error" in created) throw new Error(created.error);

  return {
    gateway: "cashfree",
    keyId: "",
    orderId,
    amountPaise: Math.round(input.amountRupees * 100),
    currency: "INR",
    name: input.name,
    description: input.description,
    prefill: input.prefill ?? {},
    callbackUrl: input.callbackUrl,
    cashfree: { paymentSessionId: created.paymentSessionId, mode: creds.environment === "test" ? "sandbox" : "production" },
  };
}

/** The few Cashfree calls confirmCashfreeReturn makes, so tests can stand in for Cashfree. */
export interface CashfreeLookup {
  orderStatus(orderId: string): Promise<{ status: string; amount: number } | { error: string }>;
  successfulPaymentId(orderId: string): Promise<string | null>;
}

const liveLookup = (creds: CashfreeCredentials): CashfreeLookup => ({
  orderStatus: (orderId) => getCashfreeOrderStatus(creds, orderId),
  successfulPaymentId: (orderId) => getCashfreeSuccessfulPaymentId(creds, orderId),
});

/**
 * What Cashfree says about the order the browser came back with. `ok` only when Cashfree itself reports the order
 * paid; the reference handed back is the order id, which is our own reference for the payment.
 */
export async function confirmCashfreeReturn(orderId: string, lookup?: CashfreeLookup): Promise<ReturnOutcome> {
  if (!ORDER_ID.test(orderId)) return { ok: false, reason: "bad_request" };
  let resolved = lookup;
  if (!resolved) {
    const creds = getPlatformCashfreeCredentials();
    if (!creds) return { ok: false, reason: "unverified" };
    resolved = liveLookup(creds);
  }
  const order = await resolved.orderStatus(orderId);
  if ("error" in order) return { ok: false, reason: "unverified" };
  if (order.status === "PAID") {
    const paymentId = (await resolved.successfulPaymentId(orderId)) ?? orderId;
    return { ok: true, reference: orderId, paymentId };
  }
  // Not paid: the person closed the window or the payment failed (ACTIVE / EXPIRED / TERMINATED), or Cashfree is
  // still settling it.
  return { ok: false, reason: order.status === "ACTIVE" || order.status === "EXPIRED" || order.status === "TERMINATED" ? "declined" : "pending" };
}

/**
 * Cashfree sends the browser back with a GET; the return routes were written for Razorpay's POST. This turns the
 * one into the other: it hands the route a POST whose form carries the order id, which confirmReturn recognises.
 */
export async function cashfreeReturnAsPost(request: Request, post: (request: Request) => Promise<Response>): Promise<Response> {
  const form = new FormData();
  form.set("cf_order_id", new URL(request.url).searchParams.get("order_id") ?? "");
  return post(new Request(request.url, { method: "POST", body: form }));
}

/**
 * Cashfree signs every webhook: base64 of HMAC-SHA256 over the timestamp header followed by the raw body, keyed with
 * the account's secret key.
 */
export function cashfreeWebhookSignatureValid(rawBody: string, timestamp: string, signature: string, secretKey: string): boolean {
  if (!rawBody || !timestamp || !signature || !secretKey) return false;
  const expected = crypto.createHmac("sha256", secretKey).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
