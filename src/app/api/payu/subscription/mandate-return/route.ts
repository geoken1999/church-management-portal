import { NextResponse } from "next/server";
import { verifyMandateReturn } from "@/lib/billing/payu-subscription";
import { finalizePayUMandateRegistration } from "@/lib/billing/payu-subscription-actions";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// PayU redirects the browser here with a POST, for both success (surl) and
// failure (furl) — organizationId/planId travel in this URL's own query
// string (set when the mandate registration was started), separate from
// the hash-covered POST body PayU sends. See payu-subscription.ts's file
// header: the hash check here is best-effort and unverified against a
// live account, unlike every other PayU return route in this app.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  const billingUrl = (status: string, extra?: string) =>
    NextResponse.redirect(`${siteUrl}/dashboard/billing?subscription=${status}${extra ? `&${extra}` : ""}`, { status: 303 });

  if (!organizationId) {
    return NextResponse.redirect(`${siteUrl}/dashboard/billing`, { status: 303 });
  }

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

  const valid = verifyMandateReturn({
    status,
    txnid,
    amount: get("amount"),
    productinfo: get("productinfo"),
    firstname: get("firstname"),
    email: get("email"),
    udf1: get("udf1"),
    si_details: get("si_details"),
    hash,
  });

  if (!valid) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: "PayU mandate-registration return had an invalid hash — treated as unverified, not activated",
      organizationId,
      metadata: { txnid, status },
    });
    return billingUrl("failed", "reason=unverified");
  }

  if (status !== "success") {
    return billingUrl("failed", "reason=declined");
  }

  const result = await finalizePayUMandateRegistration(organizationId, txnid, mihpayid);
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: `PayU mandate registration verified but couldn't be finalized: ${result.error}`,
      organizationId,
      metadata: { txnid, mihpayid },
    });
    return billingUrl("failed", "reason=finalize_failed");
  }

  return billingUrl("success");
}
