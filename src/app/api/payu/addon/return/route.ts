import { NextResponse } from "next/server";
import { verifyPayUReturn } from "@/lib/payu/client";
import { finalizeAddonOrderPayment } from "@/lib/billing/addon-actions";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// PayU redirects the browser here with a POST, for both success (surl) and
// failure (furl) — this app points both at the same URL and branches on the
// `status` field PayU sends. There's no separate client-side callback like
// Razorpay's checkout.js handler: the browser fully navigated away to PayU's
// hosted page and is now being sent back, so this route is the only place
// the payment gets confirmed. No session exists here (PayU redirected the
// browser, not our own app), so this does not call requireUser — the hash
// check is what's trusted, the same way the Razorpay webhook trusts its
// HMAC signature instead of a session.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const billingUrl = (status: string, extra?: string) =>
    NextResponse.redirect(`${siteUrl}/dashboard/billing?addon=${status}${extra ? `&${extra}` : ""}`, { status: 303 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return billingUrl("failed", "reason=bad_request");
  }

  const get = (name: string) => String(form.get(name) ?? "");
  const status = get("status");
  const txnid = get("txnid");
  const mihpayid = get("mihpayid");
  const hash = get("hash");

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
      source: "addon_purchase",
      message: "PayU add-on return had an invalid hash — treated as unverified, not credited",
      metadata: { txnid, status },
    });
    return billingUrl("failed", "reason=unverified");
  }

  if (status !== "success") {
    return billingUrl("failed", "reason=declined");
  }

  const result = await finalizeAddonOrderPayment(txnid, mihpayid);
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: `PayU add-on payment verified but couldn't be finalized: ${result.error}`,
      metadata: { txnid, mihpayid },
    });
    return billingUrl("failed", "reason=finalize_failed");
  }

  return billingUrl("success");
}
