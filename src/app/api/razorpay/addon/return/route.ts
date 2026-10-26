import { NextResponse } from "next/server";
import { cashfreeReturnAsPost } from "@/lib/cashfree/platform";
import { confirmReturn } from "@/lib/razorpay/platform";
import { finalizeAddonOrderPayment } from "@/lib/billing/addon-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Razorpay sends the browser here with a POST once an add-on payment succeeds (callback_url). No session
// exists, so what is trusted is the signed result: confirmReturn checks the signature and asks Razorpay itself
// which order and payment these are. A failed or abandoned payment comes back without a signature.
export async function POST(request: Request) {
  const billingUrl = (status: string, extra?: string) =>
    NextResponse.redirect(
      `${getSiteUrl()}/dashboard/billing?addon=${status}${extra ? `&${extra}` : ""}`,
      { status: 303 },
    );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return billingUrl("failed", "reason=bad_request");
  }

  try {
    const outcome = await confirmReturn(form);
    if (!outcome.ok) {
      if (outcome.reason === "unverified")
        await logPlatformEvent({
          level: "error",
          source: "addon_purchase",
          message:
            "Razorpay add-on return could not be verified — not credited",
        });
      return billingUrl("failed", `reason=${outcome.reason}`);
    }
    const result = await finalizeAddonOrderPayment(
      outcome.reference,
      outcome.paymentId,
    );
    if (result.error) {
      await logPlatformEvent({
        level: "error",
        source: "addon_purchase",
        message: `Razorpay add-on payment verified but couldn't be finalized: ${result.error}`,
        metadata: {
          reference: outcome.reference,
          paymentId: outcome.paymentId,
        },
      });
      return billingUrl("failed", "reason=finalize_failed");
    }
    // K-Connect minutes are bought on the K-Connect page, so that is where the buyer goes back to.
    const { data: order } = await createAdminClient()
      .from("organization_addon_orders")
      .select("addon_type")
      .eq("payu_txnid", outcome.reference)
      .maybeSingle();
    if (order?.addon_type === "kconnect")
      return NextResponse.redirect(
        `${getSiteUrl()}/dashboard/kconnect?minutes=bought`,
        { status: 303 },
      );
    return billingUrl("success");
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: `Razorpay add-on return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return billingUrl("failed", "reason=error");
  }
}

// The backup gateway (Cashfree) sends the browser back with a GET and ?order_id=; it is handled exactly like the
// Razorpay POST above, after Cashfree itself has been asked whether the order is paid.
export async function GET(request: Request) {
  return cashfreeReturnAsPost(request, POST);
}
