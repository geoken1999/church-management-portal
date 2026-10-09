import { NextResponse } from "next/server";
import { verifyPayUReturn } from "@/lib/payu/client";
import { finalizeAddonOrderPayment } from "@/lib/billing/addon-actions";
import { finalizeEventRegistrationPayment } from "@/lib/events/payu-registration";
import { finalizeMembershipPayment } from "@/lib/membership-fees/finalize";
import { finalizePayUGivingOrderPayment } from "@/lib/finance/payu-giving";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Backup confirmation path for every PayU flow, same reasoning the old
// Razorpay webhook had for 'shared'-mode giving/membership fees: the
// surl/furl redirect only fires if the visitor's browser makes it all the
// way back to this app (closed tab, lost connectivity, a dropped redirect
// mid-flight). PayU's S2S webhook (configured separately from PayU's
// dashboard, with its own URL for TEST vs LIVE mode — see
// https://docs.payu.in/docs/webhooks) sends the same field set and hash
// formula as surl/furl, as application/x-www-form-urlencoded, so this
// reuses verifyPayUReturn as-is rather than a separate verifier. Each
// finalize*Payment function does its own atomic 'created' -> 'paid' claim,
// so it's safe for this and the redirect route to both call it for the
// same payment — whichever arrives first wins, and the other is a no-op.
//
// Routing to the right flow's finalize function is by txnid prefix, set
// when each flow generates its own txnid (createAddonOrder: "addon...",
// createEventRegistrationOrder: "evreg...", createMembershipInvoiceOrder:
// "mship...", createGivingOrder's 'shared' branch: "giving...") — PayU's
// hash-based checkout has no order-level metadata field (unlike Razorpay's
// orders.create notes), so the txnid itself is what's used to tell flows
// apart here, same as in each return route's own lookup.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const get = (name: string) => String(form.get(name) ?? "");
  const status = get("status");
  const txnid = get("txnid");
  const mihpayid = get("mihpayid");
  const hash = get("hash");

  // additionalCharges changes the hash formula to one this app's checkout
  // never needs (no convenience-fee collection is configured) — if PayU
  // ever sends it anyway, verifyPayUReturn's formula won't match and this
  // correctly falls through to "unverified" rather than silently crediting
  // an unchecked payment.
  const valid = verifyPayUReturn({
    status,
    txnid,
    amount: get("amount"),
    productinfo: get("productinfo"),
    firstname: get("firstname"),
    email: get("email"),
    udf1: get("udf1"),
    hash,
  });

  if (!valid) {
    await logPlatformEvent({
      level: "error",
      source: "payu_webhook",
      message: "PayU webhook had an invalid hash — treated as unverified, not credited",
      metadata: { txnid, status },
    });
    // Acknowledged (not PayU's fault to retry) — the hash won't become
    // valid on a retry, and the surl/furl redirect path (which did its own
    // verification) is unaffected by this.
    return NextResponse.json({ ok: true });
  }

  if (status !== "success" || !txnid) {
    return NextResponse.json({ ok: true });
  }

  const finalize = txnid.startsWith("addon")
    ? finalizeAddonOrderPayment
    : txnid.startsWith("evreg")
      ? finalizeEventRegistrationPayment
      : txnid.startsWith("mship")
        ? finalizeMembershipPayment
        : txnid.startsWith("giving")
          ? finalizePayUGivingOrderPayment
          : null;

  if (!finalize) {
    await logPlatformEvent({
      level: "warning",
      source: "payu_webhook",
      message: "PayU webhook for an unrecognized txnid prefix — nothing to finalize",
      metadata: { txnid },
    });
    return NextResponse.json({ ok: true });
  }

  const result = await finalize(txnid, mihpayid);
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "payu_webhook",
      message: `PayU webhook payment verified but couldn't be finalized: ${result.error}`,
      metadata: { txnid, mihpayid },
    });
  }

  return NextResponse.json({ ok: true });
}
