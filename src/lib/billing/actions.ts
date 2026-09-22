"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { getRazorpayEnv, getRazorpayPlanId } from "@/lib/billing/env";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import type { PlanId } from "@/lib/plans/config";

const BILLING_PATH = "/dashboard/billing";

function isPlanId(value: string): value is PlanId {
  return value === "basic" || value === "premium" || value === "pro";
}

// A subscription in any of these states already has (or is in the
// process of getting) a live mandate — a second checkout for the same
// plan would create a duplicate, and switching plans mid-mandate isn't
// supported yet (see cancelSubscription's doc comment).
const IN_PROGRESS_STATUSES = ["created", "authenticated", "active", "pending"];

export interface CheckoutState {
  error?: string;
  subscriptionId?: string;
  keyId?: string;
}

export async function startSubscriptionCheckout(planId: string): Promise<CheckoutState> {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage billing." };
  }
  if (!isPlanId(planId)) {
    return { error: "Select a valid plan." };
  }

  const existing = await getOrganizationSubscription(membership.organization.id);

  if (existing && IN_PROGRESS_STATUSES.includes(existing.status)) {
    if (existing.status === "created" && existing.plan_id === planId && existing.razorpay_subscription_id) {
      // An earlier checkout for this same plan was started but never
      // completed (e.g. the customer closed the Razorpay popup) — reuse
      // it rather than creating an orphaned duplicate subscription.
      return { subscriptionId: existing.razorpay_subscription_id, keyId: getRazorpayEnv().keyId };
    }
    return {
      error:
        existing.plan_id === planId
          ? "You're already subscribed to this plan."
          : "Cancel your current subscription before switching plans.",
    };
  }

  const razorpay = createRazorpayClient();
  let razorpayPlanId: string;
  try {
    razorpayPlanId = getRazorpayPlanId(planId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Billing isn't configured yet." };
  }

  let subscription;
  try {
    subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      // Razorpay requires a finite total_count — 120 monthly cycles (10
      // years) is effectively "until cancelled" for this app's purposes.
      total_count: 120,
      notes: { organization_id: membership.organization.id, plan_id: planId },
    });
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }

  const admin = createAdminClient();
  await admin.from("organization_subscriptions").upsert(
    {
      organization_id: membership.organization.id,
      razorpay_subscription_id: subscription.id,
      plan_id: planId,
      status: subscription.status,
      short_url: subscription.short_url,
    },
    { onConflict: "organization_id" },
  );

  revalidatePath(BILLING_PATH);
  return { subscriptionId: subscription.id, keyId: getRazorpayEnv().keyId };
}

export interface CancelSubscriptionState {
  error?: string;
  success?: boolean;
}

// Cancels immediately rather than at the end of the current billing
// cycle — simpler to reason about than tracking a "scheduled to cancel"
// state, at the cost of not refunding the unused remainder of the period.
export async function cancelSubscription(): Promise<CancelSubscriptionState> {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage billing." };
  }

  const existing = await getOrganizationSubscription(membership.organization.id);
  if (!existing?.razorpay_subscription_id) {
    return { error: "There's no subscription to cancel." };
  }

  const razorpay = createRazorpayClient();
  try {
    await razorpay.subscriptions.cancel(existing.razorpay_subscription_id, false);
  } catch {
    return { error: "Couldn't cancel the subscription. Please try again." };
  }

  // Applied here too (not just left to the webhook) so the UI reflects
  // the cancellation immediately rather than waiting on Razorpay's
  // webhook round-trip. Basic is the floor plan everyone falls back to —
  // there's no free/suspended tier below it yet.
  const admin = createAdminClient();
  await Promise.all([
    admin.from("organization_subscriptions").update({ status: "cancelled" }).eq("organization_id", membership.organization.id),
    admin.from("organizations").update({ plan: "basic" }).eq("id", membership.organization.id),
  ]);

  revalidatePath(BILLING_PATH);
  return { success: true };
}
