import { NextResponse } from "next/server";
import { verifyPayUReturn } from "@/lib/payu/client";
import { finalizeMembershipPayment } from "@/lib/membership-fees/finalize";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// PayU redirects the browser here with a POST, for both success (surl) and
// failure (furl) — token travels in this URL's own query string (set when
// the order was created), separate from the hash-covered POST body PayU
// sends. No session exists here, the same as the other PayU return routes —
// the hash check is what's trusted. On success this redirects back to the
// same public page with no extra query param: the invoice is already marked
// paid by the time the redirect happens, so a plain reload shows "already
// paid" on its own. On failure, ?payment=failed lets the page show a
// banner — the invoice stays 'due', so the Pay button is still right there.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/`, { status: 303 });
  }

  const payUrl = (extra?: string) => NextResponse.redirect(`${siteUrl}/pay/membership/${token}${extra ? `?${extra}` : ""}`, { status: 303 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return payUrl("payment=failed&reason=bad_request");
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
      source: "membership_fee",
      message: "PayU membership fee return had an invalid hash — treated as unverified, not credited",
      metadata: { txnid, status, token },
    });
    return payUrl("payment=failed&reason=unverified");
  }

  if (status !== "success") {
    return payUrl("payment=failed&reason=declined");
  }

  const result = await finalizeMembershipPayment(txnid, mihpayid);
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "membership_fee",
      message: `PayU membership fee payment verified but couldn't be finalized: ${result.error}`,
      metadata: { txnid, mihpayid, token },
    });
    return payUrl("payment=failed&reason=finalize_failed");
  }

  return payUrl();
}
