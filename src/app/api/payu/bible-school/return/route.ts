import { NextResponse } from "next/server";
import { verifyPayUReturn } from "@/lib/payu/client";
import { finalizeProgramPayment } from "@/lib/lms/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// PayU redirects the browser here with a POST for both success and failure. No session exists, so the
// hash PayU signs is what is trusted. The order id travels in this URL's own query string.
export async function POST(request: Request) {
  try {
    return await handleReturn(request);
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `PayU course payment return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
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
  const get = (name: string) => String(form.get(name) ?? "");
  const status = get("status");
  const txnid = get("txnid");

  const valid = verifyPayUReturn({
    status,
    txnid,
    amount: get("amount"),
    productinfo: get("productinfo"),
    firstname: get("firstname"),
    email: get("email"),
    udf1: get("udf1"),
    hash: get("hash"),
  });
  if (!valid) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message:
        "PayU course payment return had an invalid hash — treated as unverified, not credited",
      metadata: { txnid, status, orderId },
    });
    return back("failed");
  }
  if (status !== "success") return back("failed");

  const result = await finalizeProgramPayment(txnid, get("mihpayid"));
  if (result.error) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `PayU course payment verified but couldn't be finalized: ${result.error}`,
      metadata: { txnid, orderId },
    });
    return back("failed");
  }
  return back("success");
}
