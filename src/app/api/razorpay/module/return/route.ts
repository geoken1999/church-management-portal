import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscriptionSignatureValid } from "@/lib/billing/razorpay-subscription";
import { activateModuleSubscription } from "@/lib/billing/modules";
import { getRazorpayEnv } from "@/lib/billing/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Razorpay sends the browser here with a POST once a church has authorised a module's subscription. No session
// exists, so what is trusted is the signed result: the signature must match, and the subscription must be the one
// we created for this very church and module. The webhook activates it too, so closing the page early loses nothing.
export async function POST(request: Request) {
  const siteUrl = getSiteUrl();
  const params = new URL(request.url).searchParams;
  const organizationId = params.get("organizationId");
  const moduleKey = params.get("moduleKey") ?? "";
  const back = (status: string, extra?: string) =>
    NextResponse.redirect(`${siteUrl}/dashboard/billing?module=${status}&key=${encodeURIComponent(moduleKey)}${extra ? `&${extra}` : ""}`, { status: 303 });
  if (!organizationId) return NextResponse.redirect(`${siteUrl}/dashboard/billing`, { status: 303 });

  try {
    const form = await request.formData();
    const get = (name: string) => String(form.get(name) ?? "");
    const paymentId = get("razorpay_payment_id");
    const subscriptionId = get("razorpay_subscription_id");
    const signature = get("razorpay_signature");
    if (!paymentId && !signature) return back("failed", "reason=declined");
    if (!subscriptionSignatureValid(paymentId, subscriptionId, signature, getRazorpayEnv().keySecret)) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: "Razorpay module return could not be verified: not activated",
        organizationId,
        metadata: { subscriptionId, moduleKey },
      });
      return back("failed", "reason=unverified");
    }
    const { data: row } = await createAdminClient()
      .from("organization_module_subscriptions")
      .select("organization_id, module_key")
      .eq("razorpay_subscription_id", subscriptionId)
      .maybeSingle();
    if (!row || row.organization_id !== organizationId || row.module_key !== moduleKey) return back("failed", "reason=unverified");

    const result = await activateModuleSubscription(subscriptionId);
    if (result.error) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: `Razorpay module verified but couldn't be activated: ${result.error}`,
        organizationId,
        metadata: { subscriptionId, paymentId, moduleKey },
      });
      return back("failed", "reason=finalize_failed");
    }
    return back("success");
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: `Razorpay module return failed unexpectedly: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
    });
    return back("failed", "reason=error");
  }
}
