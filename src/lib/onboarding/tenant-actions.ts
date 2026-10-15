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
import {
  buildMandateRegistrationFields,
  type MandateRegistrationFields,
} from "@/lib/billing/payu-subscription";
import { getSiteUrl } from "@/lib/site-url";
import { getOnboarding } from "@/lib/onboarding/store";

export interface OnboardingCheckoutState {
  error?: string;
  billingErrors?: BillingDetailsErrors;
  payuFields?: MandateRegistrationFields;
  payuActionUrl?: string;
}

// The tenant authorizes the UPI Autopay subscription for the modules the platform admin set up.
// The amount comes from the saved onboarding, never from the browser.
export async function startOnboardingCheckout(
  vpa: string,
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
  if (!onboarding || onboarding.status !== "awaiting_payment")
    return { error: "There's no plan waiting for you to start." };
  const trimmedVpa = vpa.trim();
  if (!trimmedVpa.includes("@"))
    return { error: "Enter a valid UPI ID (e.g. yourname@bank)." };

  const saved = await saveBillingDetails(organizationId, billing);
  if ("errors" in saved)
    return {
      error: "Check your billing details.",
      billingErrors: saved.errors,
    };

  const txnid = `sub${Date.now()}${organizationId.replace(/-/g, "").slice(0, 8)}`;
  const returnUrl = `${getSiteUrl()}/api/payu/subscription/mandate-return?organizationId=${organizationId}&planId=pro`;
  const today = new Date();
  const endDate = new Date(today);
  endDate.setFullYear(endDate.getFullYear() + 10);

  let built;
  try {
    built = buildMandateRegistrationFields({
      txnid,
      amountRupees: withGst(onboarding.monthly_base).total,
      productinfo: "KingdomFlow modules subscription (Monthly)",
      firstname: profile ? profile.first_name : membership.organization.name,
      email: profile?.email ?? user.email ?? "",
      phone: profile?.phone ?? "9999999999",
      vpa: trimmedVpa,
      surl: returnUrl,
      furl: returnUrl,
      udf1: `sub:${organizationId}`,
      paymentStartDate: today.toISOString().slice(0, 10),
      paymentEndDate: endDate.toISOString().slice(0, 10),
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Couldn't start checkout. Please try again.",
    };
  }

  const { error } = await createAdminClient()
    .from("organization_subscriptions")
    .upsert(
      {
        organization_id: organizationId,
        plan_id: "pro",
        billing_interval: "monthly",
        status: "created",
        payu_txnid: txnid,
        payu_vpa: trimmedVpa,
        monthly_amount: onboarding.monthly_base,
        onboarding_modules: onboarding.modules,
      },
      { onConflict: "organization_id" },
    );
  if (error) {
    console.error("organization_subscriptions upsert failed:", error.message);
    return { error: "Couldn't start checkout. Please try again." };
  }
  revalidatePath("/dashboard/billing");
  return { payuFields: built.fields, payuActionUrl: built.actionUrl };
}
