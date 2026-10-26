import { NextResponse } from "next/server";
import { cashfreeWebhookSignatureValid, getPlatformCashfreeCredentials } from "@/lib/cashfree/platform";
import { finalizeByReference } from "@/lib/payments/finalize-by-reference";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Cashfree's word that a payment succeeded, for the backup gateway: the safety net for a person who paid and closed
// the page before it returned. Add {site}/api/cashfree/webhook in Cashfree Dashboard → Developers → Webhooks and
// subscribe to the payment success event. The signature is checked against the raw bytes before anything is read.
export async function POST(request: Request) {
  const creds = getPlatformCashfreeCredentials();
  if (!creds) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
  const signature = request.headers.get("x-webhook-signature") ?? "";
  if (!cashfreeWebhookSignatureValid(rawBody, timestamp, signature, creds.secretKey)) {
    await logPlatformEvent({ level: "warning", source: "payment_gateway", message: "Invalid Cashfree webhook signature" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: { type?: string; data?: { order?: { order_id?: string }; payment?: { cf_payment_id?: string | number; payment_status?: string } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Only a successful payment is acted on; anything else is acknowledged so Cashfree doesn't retry it.
  if (payload.type !== "PAYMENT_SUCCESS_WEBHOOK" || payload.data?.payment?.payment_status !== "SUCCESS") return NextResponse.json({ ok: true });
  const reference = payload.data?.order?.order_id ?? "";
  const paymentId = payload.data?.payment?.cf_payment_id != null ? String(payload.data.payment.cf_payment_id) : "";
  if (!reference || !paymentId) return NextResponse.json({ ok: true });

  try {
    const error = await finalizeByReference(reference, paymentId);
    if (error) await logPlatformEvent({ level: "error", source: "payment_gateway", message: `Cashfree payment for ${reference} could not be finalized: ${error}`, metadata: { reference, paymentId } });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "payment_gateway",
      message: `Cashfree payment for ${reference} failed: ${err instanceof Error ? err.message : "unknown error"}`,
      metadata: { reference, paymentId },
    });
    // A 500 makes Cashfree retry the event.
    return NextResponse.json({ error: "Finalize failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
