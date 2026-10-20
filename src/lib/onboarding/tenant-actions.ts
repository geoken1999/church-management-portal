"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { withGst } from "@/lib/billing/gst";
import { saveBillingDetails } from "@/lib/billing/billing-details-dal";
import type {
  BillingDetailsErrors,
  BillingDetailsInput,
} from "@/lib/billing/billing-details";
import type { RazorpaySubscriptionCheckout } from "@/lib/razorpay/checkout";
import { createSubscriptionCheckout } from "@/lib/billing/razorpay-subscription";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";
import { getOnboarding } from "@/lib/onboarding/store";

export interface OnboardingCheckoutState {
  error?: string;
  billingErrors?: BillingDetailsErrors;
  checkout?: RazorpaySubscriptionCheckout;
}

// The tenant authorizes the monthly Razorpay subscription for the modules the platform admin set up.
// The amount comes from the saved onboarding, never from the browser.
export async function startOnboardingCheckout(
  billing: BillingDetailsInput,
): Promise<OnboardingCheckoutState> {
  const user = await requireUser();
  const [profile, membership] = await Promise.all([
    getProfile(),
    requireOrganization(),
  ]);
  if (membership.role !== "owner" && membership.role !== "admin")
    return { error: "Only owners and admins can manage billing." };

  const organizationId = membership.organization.id;
  const onboarding = await getOnboarding(organizationId);
  if (
    !onboarding ||
    onboarding.plan_type !== "custom" ||
    onboarding.status !== "awaiting_payment"
  )
    return { error: "There's no plan waiting for you to start." };
  const saved = await saveBillingDetails(organizationId, billing);
  if ("errors" in saved)
    return {
      error: "Check your billing details.",
      billingErrors: saved.errors,
    };

  let created;
  try {
    created = await createSubscriptionCheckout({
      organizationId,
      planLabel: "KingdomFlow modules subscription",
      totalRupees: withGst(onboarding.monthly_base).total,
      prefill: {
        name: profile ? profile.first_name : membership.organization.name,
        email: profile?.email ?? user.email ?? undefined,
        contact: profile?.phone ?? undefined,
      },
      callbackUrl: `${getSiteUrl()}/api/razorpay/subscription/return?organizationId=${organizationId}`,
      notes: { plan_id: "pro", kind: "onboarding" },
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: `Razorpay subscription creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
    });
    return { error: "Couldn't start checkout. Please try again." };
  }

  const { error } = await createAdminClient()
    .from("organization_subscriptions")
    .upsert(
      {
        organization_id: organizationId,
        plan_id: "pro",
        billing_interval: "monthly",
        status: "created",
        razorpay_subscription_id: created.subscriptionId,
        short_url: created.shortUrl,
        cancel_at_period_end: false,
        cancel_requested_at: null,
        monthly_amount: onboarding.monthly_base,
        onboarding_modules: onboarding.modules,
        onboarding_credits: onboarding.credits as never,
      },
      { onConflict: "organization_id" },
    );
  if (error) {
    console.error("organization_subscriptions upsert failed:", error.message);
    return { error: "Couldn't start checkout. Please try again." };
  }
  revalidatePath("/dashboard/billing");
  return { checkout: created.checkout };
}
