import { NextResponse } from "next/server";
import { cashfreeReturnAsPost } from "@/lib/cashfree/platform";
import { confirmReturn } from "@/lib/razorpay/platform";
import { finalizeEventRegistrationPayment } from "@/lib/events/registration-payment";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Razorpay sends the browser here with a POST once a paid-event payment succeeds. eventId and registrationId
// travel in this URL's own query string (set when the order was created). No session exists, so what is
// trusted is the signed result (see confirmReturn).
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

  if (!eventId)
    return NextResponse.redirect(`${siteUrl}/events`, { status: 303 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return registerUrl("failed", "reason=bad_request");
  }

  try {
    const outcome = await confirmReturn(form);
    if (!outcome.ok) {
      if (outcome.reason === "unverified")
        await logPlatformEvent({
          level: "error",
          source: "event_registration_payment",
          message:
            "Razorpay event registration return could not be verified — not credited",
          metadata: { registrationId },
        });
      return registerUrl("failed", `reason=${outcome.reason}`);
    }
    const result = await finalizeEventRegistrationPayment(
      outcome.reference,
      outcome.paymentId,
    );
    if (result.error) {
      await logPlatformEvent({
        level: "error",
        source: "event_registration_payment",
        message: `Razorpay event registration payment verified but couldn't be finalized: ${result.error}`,
        metadata: {
          reference: outcome.reference,
          paymentId: outcome.paymentId,
          registrationId,
        },
      });
      return registerUrl("failed", "reason=finalize_failed");
    }
    return registerUrl("success");
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "event_registration_payment",
      message: `Razorpay event registration return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
      metadata: { registrationId },
    });
    return registerUrl("failed", "reason=error");
  }
}

// The backup gateway (Cashfree) sends the browser back with a GET and ?order_id=; it is handled exactly like the
// Razorpay POST above, after Cashfree itself has been asked whether the order is paid.
export async function GET(request: Request) {
  return cashfreeReturnAsPost(request, POST);
}
