import { NextResponse } from "next/server";
import { verifyPayUReturn } from "@/lib/payu/client";
import { finalizeEventRegistrationPayment } from "@/lib/events/payu-registration";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// PayU redirects the browser here with a POST, for both success (surl) and
// failure (furl) — eventId and registrationId travel in this URL's own
// query string (set when the order was created), separate from the
// hash-covered POST body PayU sends. No session exists here, the same as
// the add-on pack return route — the hash check is what's trusted.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const registrationId = url.searchParams.get("registrationId");

  const registerUrl = (status: string, extra?: string) =>
    NextResponse.redirect(
      `${siteUrl}/events/register/${eventId}?payment=${status}${registrationId ? `&registrationId=${registrationId}` : ""}${extra ? `&${extra}` : ""}`,
      { status: 303 },
    );

  if (!eventId) {
    return NextResponse.redirect(`${siteUrl}/events`, { status: 303 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return registerUrl("failed", "reason=bad_request");
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
      source: "event_registration_payment",
      message: "PayU event registration return had an invalid hash — treated as unverified, not credited",
      metadata: { txnid, status, registrationId },
    });
    return registerUrl("failed", "reason=unverified");
  }

  if (status !== "success") {
    return registerUrl("failed", "reason=declined");
  }

  const result = await finalizeEventRegistrationPayment(txnid, mihpayid);
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "event_registration_payment",
      message: `PayU event registration payment verified but couldn't be finalized: ${result.error}`,
      metadata: { txnid, mihpayid, registrationId },
    });
    return registerUrl("failed", "reason=finalize_failed");
  }

  return registerUrl("success");
}
