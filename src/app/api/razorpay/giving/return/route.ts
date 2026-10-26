import { NextResponse } from "next/server";
import { cashfreeReturnAsPost } from "@/lib/cashfree/platform";
import { confirmReturn } from "@/lib/razorpay/platform";
import { finalizePayUGivingOrderPayment } from "@/lib/finance/payu-giving";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";
import { isGivingType } from "@/lib/finance/giving-types";

// Razorpay sends the browser here with a POST after a 'shared'-mode gift (KingdomFlow's own account). A
// church's own Razorpay keys keep using the in-page checkout callback, and its own PayU/Cashfree keep their
// own return routes. The giving link's token and kind travel in this URL's query; no session exists, so the
// signed result (see confirmReturn) is what is trusted.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(`${siteUrl}/`, { status: 303 });

  const isChurch = url.searchParams.get("scope") === "church";
  const typeParam = url.searchParams.get("type");
  const basePath = isChurch ? `/give/church/${token}` : `/give/${token}`;
  const typeQuery =
    isChurch && typeParam && isGivingType(typeParam)
      ? `&type=${typeParam}`
      : "";
  const giveUrl = (status: string, extra?: string) =>
    NextResponse.redirect(
      `${siteUrl}${basePath}?payment=${status}${typeQuery}${extra ? `&${extra}` : ""}`,
      { status: 303 },
    );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return giveUrl("failed", "reason=bad_request");
  }

  try {
    const outcome = await confirmReturn(form);
    if (!outcome.ok) {
      if (outcome.reason === "unverified")
        await logPlatformEvent({
          level: "error",
          source: "fundraiser_giving",
          message:
            "Razorpay giving return could not be verified — not credited",
          metadata: { token },
        });
      return giveUrl("failed", `reason=${outcome.reason}`);
    }
    const result = await finalizePayUGivingOrderPayment(
      outcome.reference,
      outcome.paymentId,
    );
    if (result.error) {
      await logPlatformEvent({
        level: "error",
        source: "fundraiser_giving",
        message: `Razorpay giving payment verified but couldn't be finalized: ${result.error}`,
        metadata: {
          reference: outcome.reference,
          paymentId: outcome.paymentId,
          token,
        },
      });
      return giveUrl("failed", "reason=finalize_failed");
    }
    return giveUrl("success");
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "fundraiser_giving",
      message: `Razorpay giving return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return giveUrl("failed", "reason=error");
  }
}

// The backup gateway (Cashfree) sends the browser back with a GET and ?order_id=; it is handled exactly like the
// Razorpay POST above, after Cashfree itself has been asked whether the order is paid.
export async function GET(request: Request) {
  return cashfreeReturnAsPost(request, POST);
}
