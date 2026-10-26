import { NextResponse } from "next/server";
import { cashfreeReturnAsPost } from "@/lib/cashfree/platform";
import { confirmReturn } from "@/lib/razorpay/platform";
import { finalizeProgramPayment } from "@/lib/lms/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Razorpay sends the browser here with a POST after a payment. No session exists, so the signed result
// is what is trusted (see confirmReturn). The order id travels in this URL's own query string.
export async function POST(request: Request) {
  try {
    return await handleReturn(request);
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `Razorpay course payment return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return NextResponse.redirect(`${getSiteUrl()}/`, { status: 303 });
  }
}

async function handleReturn(request: Request) {
  const siteUrl = getSiteUrl();
  const orderId = new URL(request.url).searchParams.get("orderId") ?? "";

  const back = async (status: string) => {
    let slug: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(orderId)) {
      const admin = createAdminClient();
      const { data: order } = await admin
        .from("lms_payment_orders")
        .select("organization_id")
        .eq("id", orderId)
        .maybeSingle();
      if (order) {
        const { data: org } = await admin
          .from("organizations")
          .select("slug")
          .eq("id", order.organization_id)
          .maybeSingle();
        slug = org?.slug ?? null;
      }
    }
    return NextResponse.redirect(
      slug
        ? `${siteUrl}/bible-school/${slug}?payment=${status}`
        : `${siteUrl}/`,
      { status: 303 },
    );
  };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back("failed");
  }

  const outcome = await confirmReturn(form);
  if (!outcome.ok) {
    if (outcome.reason === "unverified")
      await logPlatformEvent({
        level: "error",
        source: "bible_school_payment",
        message:
          "Razorpay course payment return could not be verified — not credited",
        metadata: { orderId },
      });
    return back("failed");
  }

  const result = await finalizeProgramPayment(
    outcome.reference,
    outcome.paymentId,
  );
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `Razorpay course payment verified but couldn't be finalized: ${result.error}`,
      metadata: { reference: outcome.reference, orderId },
    });
    return back("failed");
  }
  return back("success");
}

// The backup gateway (Cashfree) sends the browser back with a GET and ?order_id=; it is handled exactly like the
// Razorpay POST above, after Cashfree itself has been asked whether the order is paid.
export async function GET(request: Request) {
  return cashfreeReturnAsPost(request, POST);
}
