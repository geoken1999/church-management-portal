"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { createSubscriptionCheckout } from "@/lib/billing/razorpay-subscription";
import {
  sendSubscriptionCancelledEmail,
  sendSubscriptionCancellationScheduledEmail,
} from "@/lib/billing/receipts";
import { cancelMode, dateLabel } from "@/lib/billing/cancellation";
import { planNameFor } from "@/lib/billing/cancellation-store";
import { isPlanId, PLANS, type PlanId } from "@/lib/plans/config";
import { withGst } from "@/lib/billing/gst";
import { saveBillingDetails } from "@/lib/billing/billing-details-dal";
import type {
  BillingDetailsErrors,
  BillingDetailsInput,
} from "@/lib/billing/billing-details";
import type { RazorpaySubscriptionCheckout } from "@/lib/razorpay/checkout";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";

const BILLING_PATH = "/dashboard/billing";

// A subscription in any of these states already has (or is getting) a live authorisation: a second checkout
// would create a duplicate, and switching plans mid-subscription is not supported (cancel first).
const IN_PROGRESS_STATUSES = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
];

export interface SubscriptionCheckoutState {
  error?: string;
  billingErrors?: BillingDetailsErrors;
  checkout?: RazorpaySubscriptionCheckout;
}

// Called from the Billing page. The church picks a plan, confirms the details its monthly invoices are made
// out to, and authorises the subscription in Razorpay's own window. The price (with 18% GST) is taken from
// the plan on the server, never from the browser. An abandoned checkout is simply replaced by the next try.
export async function startSubscriptionCheckout(
  planId: string,
  billing: BillingDetailsInput,
): Promise<SubscriptionCheckoutState> {
  const user = await requireUser();
  const [profile, membership] = await Promise.all([
    getProfile(),
    requireOrganization(),
  ]);

  if (membership.role !== "owner" && membership.role !== "admin")
    return { error: "Only owners and admins can manage billing." };
  if (!isPlanId(planId)) return { error: "Select a valid plan." };

  const saved = await saveBillingDetails(membership.organization.id, billing);
  if ("errors" in saved)
    return {
      error: "Check your billing details.",
      billingErrors: saved.errors,
    };

  const existing = await getOrganizationSubscription(
    membership.organization.id,
  );
  // A not-yet-authorised attempt can be replaced; anything live blocks a second one.
  const replaceable = existing?.status === "created";
  if (
    existing &&
    IN_PROGRESS_STATUSES.includes(existing.status) &&
    !replaceable
  ) {
    return {
      error:
        existing.plan_id === planId
          ? "You're already subscribed to this plan."
          : "Cancel your current subscription before switching plans.",
    };
  }

  const plan = PLANS[planId as PlanId];
  let created;
  try {
    created = await createSubscriptionCheckout({
      organizationId: membership.organization.id,
      planLabel: `KingdomFlow ${plan.name} plan`,
      totalRupees: withGst(plan.priceInRupees).total,
      prefill: {
        name: profile?.first_name ?? membership.organization.name,
        email: profile?.email ?? user.email ?? undefined,
        contact: profile?.phone ?? undefined,
      },
      callbackUrl: `${getSiteUrl()}/api/razorpay/subscription/return?organizationId=${membership.organization.id}`,
      notes: { plan_id: planId },
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: `Razorpay subscription creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: membership.organization.id,
    });
    return { error: "Couldn't start checkout. Please try again." };
  }

  const { error: upsertError } = await createAdminClient()
    .from("organization_subscriptions")
    .upsert(
      {
        organization_id: membership.organization.id,
        razorpay_subscription_id: created.subscriptionId,
        plan_id: planId,
        billing_interval: "monthly",
        status: "created",
        short_url: created.shortUrl,
        monthly_amount: null,
        onboarding_modules: null,
        onboarding_credits: null,
        cancel_at_period_end: false,
        cancel_requested_at: null,
      },
      { onConflict: "organization_id" },
    );
  if (upsertError) {
    console.error(
      "organization_subscriptions upsert failed:",
      upsertError.message,
    );
    return { error: "Couldn't start checkout. Please try again." };
  }

  revalidatePath(BILLING_PATH);
  return { checkout: created.checkout };
}

export interface CancelSubscriptionState {
  error?: string;
  success?: boolean;
  // Set when the subscription keeps running until this date (ISO) instead of ending now.
  endsAt?: string;
}

// A live subscription is cancelled at the end of the period it has paid for: the church keeps its plan until
// then, Razorpay stops charging, and when the cycle ends its webhook closes the subscription out
// (finishScheduledCancellation). One that never became live is cancelled at once. A subscription still on
// the old PayU billing has no Razorpay side, so it is only marked locally.
export async function cancelSubscription(): Promise<CancelSubscriptionState> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin")
    return { error: "Only owners and admins can manage billing." };

  const existing = await getOrganizationSubscription(
    membership.organization.id,
  );
  if (!existing || (!existing.razorpay_subscription_id && !existing.payu_txnid))
    return { error: "There's no subscription to cancel." };
  if (existing.cancel_at_period_end)
    return { success: true, endsAt: existing.next_charge_at ?? undefined };

  const admin = createAdminClient();
  const planName = planNameFor(existing.plan_id, existing.monthly_amount);
  const atPeriodEnd =
    cancelMode(existing.status, existing.next_charge_at, new Date()) ===
      "at_period_end" && existing.next_charge_at;

  // Razorpay first, so a failure leaves everything as it was. A subscription still 'created' was never
  // authorised, so there is nothing on Razorpay's side to cancel and it can always be cleared locally.
  if (existing.razorpay_subscription_id && existing.status !== "created") {
    try {
      await createRazorpayClient().subscriptions.cancel(
        existing.razorpay_subscription_id,
        Boolean(atPeriodEnd),
      );
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: `Razorpay subscription cancel failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: membership.organization.id,
      });
      return { error: "Couldn't cancel the subscription. Please try again." };
    }
  }

  if (atPeriodEnd && existing.next_charge_at) {
    const { error } = await admin
      .from("organization_subscriptions")
      .update({
        cancel_at_period_end: true,
        cancel_requested_at: new Date().toISOString(),
      })
      .eq("organization_id", membership.organization.id);
    if (error)
      return { error: "Couldn't cancel the subscription. Please try again." };
    await sendSubscriptionCancellationScheduledEmail(
      membership.organization.id,
      planName,
      dateLabel(existing.next_charge_at),
    );
    revalidatePath(BILLING_PATH);
    return { success: true, endsAt: existing.next_charge_at };
  }

  await Promise.all([
    admin
      .from("organization_subscriptions")
      .update({
        status: "cancelled",
        next_charge_at: null,
        cancel_at_period_end: false,
      })
      .eq("organization_id", membership.organization.id),
    admin
      .from("organizations")
      .update(
        existing.monthly_amount !== null
          ? { plan: "basic", custom_plan_limits: null }
          : { plan: "basic" },
      )
      .eq("id", membership.organization.id),
  ]);
  if (existing.status === "active")
    await sendSubscriptionCancelledEmail(membership.organization.id, planName);
  revalidatePath(BILLING_PATH);
  return { success: true };
}

// Takes back a cancellation that is still waiting for the end of the period. Razorpay is asked to drop the
// scheduled cancellation; if it will not, the church is told to subscribe again once the period ends.
export async function keepSubscription(): Promise<CancelSubscriptionState> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin")
    return { error: "Only owners and admins can manage billing." };
  const existing = await getOrganizationSubscription(
    membership.organization.id,
  );
  if (
    !existing?.cancel_at_period_end ||
    existing.status !== "active" ||
    !existing.next_charge_at ||
    new Date(existing.next_charge_at) <= new Date()
  ) {
    return {
      error:
        "This subscription can't be resumed. Choose a plan to subscribe again.",
    };
  }
  if (existing.razorpay_subscription_id) {
    try {
      await createRazorpayClient().subscriptions.cancelScheduledChanges(
        existing.razorpay_subscription_id,
      );
    } catch {
      return {
        error:
          "This cancellation can't be taken back. Your plan stays until the period ends; subscribe again after that.",
      };
    }
  }
  const { error } = await createAdminClient()
    .from("organization_subscriptions")
    .update({ cancel_at_period_end: false, cancel_requested_at: null })
    .eq("organization_id", membership.organization.id);
  if (error)
    return { error: "Couldn't resume the subscription. Please try again." };
  revalidatePath(BILLING_PATH);
  return { success: true };
}
