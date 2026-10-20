import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activateRazorpaySubscription,
  subscriptionSignatureValid,
} from "@/lib/billing/razorpay-subscription";
import { getRazorpayEnv } from "@/lib/billing/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Razorpay sends the browser here with a POST once the church has authorised a subscription. No session
// exists, so what is trusted is the signed result: the signature must match, and the subscription must be the
// one we created for this very church. The webhook activates it too, so closing the page early loses nothing.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const organizationId = new URL(request.url).searchParams.get(
    "organizationId",
  );
  const billingUrl = (status: string, extra?: string) =>
    NextResponse.redirect(
      `${siteUrl}/dashboard/billing?subscription=${status}${extra ? `&${extra}` : ""}`,
      { status: 303 },
    );
  if (!organizationId)
    return NextResponse.redirect(`${siteUrl}/dashboard/billing`, {
      status: 303,
    });

  try {
    const form = await request.formData();
    const get = (name: string) => String(form.get(name) ?? "");
    const paymentId = get("razorpay_payment_id");
    const subscriptionId = get("razorpay_subscription_id");
    const signature = get("razorpay_signature");
    if (!paymentId && !signature)
      return billingUrl("failed", "reason=declined");
    if (
      !subscriptionSignatureValid(
        paymentId,
        subscriptionId,
        signature,
        getRazorpayEnv().keySecret,
      )
    ) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message:
          "Razorpay subscription return could not be verified — not activated",
        organizationId,
        metadata: { subscriptionId },
      });
      return billingUrl("failed", "reason=unverified");
    }

    const { data: row } = await createAdminClient()
      .from("organization_subscriptions")
      .select("organization_id")
      .eq("razorpay_subscription_id", subscriptionId)
      .maybeSingle();
    if (!row || row.organization_id !== organizationId)
      return billingUrl("failed", "reason=unverified");

    const result = await activateRazorpaySubscription(subscriptionId);
    if (result.error) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: `Razorpay subscription verified but couldn't be activated: ${result.error}`,
        organizationId,
        metadata: { subscriptionId, paymentId },
      });
      return billingUrl("failed", "reason=finalize_failed");
    }
    return billingUrl("success");
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: `Razorpay subscription return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
    });
    return billingUrl("failed", "reason=error");
  }
}
