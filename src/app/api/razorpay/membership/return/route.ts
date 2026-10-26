import { NextResponse } from "next/server";
import { cashfreeReturnAsPost } from "@/lib/cashfree/platform";
import { confirmReturn } from "@/lib/razorpay/platform";
import { finalizeMembershipPayment } from "@/lib/membership-fees/finalize";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Razorpay sends the browser here with a POST once a membership fee is paid; the token travels in this URL's
// own query string. No session exists, so what is trusted is the signed result (see confirmReturn). On success
// this redirects back to the same public page with no extra query: the invoice is already marked paid, so a
// reload shows "already paid" by itself. On failure ?payment=failed lets the page show a banner; the invoice
// stays 'due', so the Pay button is still right there.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${siteUrl}/`, { status: 303 });

  const payUrl = (extra?: string) =>
    NextResponse.redirect(
      `${siteUrl}/pay/membership/${token}${extra ? `?${extra}` : ""}`,
      { status: 303 },
    );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return payUrl("payment=failed&reason=bad_request");
  }

  try {
    const outcome = await confirmReturn(form);
    if (!outcome.ok) {
      if (outcome.reason === "unverified")
        await logPlatformEvent({
          level: "error",
          source: "membership_fee",
          message:
            "Razorpay membership fee return could not be verified — not credited",
          metadata: { token },
        });
      return payUrl(`payment=failed&reason=${outcome.reason}`);
    }
    const result = await finalizeMembershipPayment(
      outcome.reference,
      outcome.paymentId,
    );
    if (result.error) {
      await logPlatformEvent({
        level: "error",
        source: "membership_fee",
        message: `Razorpay membership fee payment verified but couldn't be finalized: ${result.error}`,
        metadata: {
          reference: outcome.reference,
          paymentId: outcome.paymentId,
          token,
        },
      });
      return payUrl("payment=failed&reason=finalize_failed");
    }
    return payUrl();
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "membership_fee",
      message: `Razorpay membership fee return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return payUrl("payment=failed&reason=error");
  }
}

// The backup gateway (Cashfree) sends the browser back with a GET and ?order_id=; it is handled exactly like the
// Razorpay POST above, after Cashfree itself has been asked whether the order is paid.
export async function GET(request: Request) {
  return cashfreeReturnAsPost(request, POST);
}
