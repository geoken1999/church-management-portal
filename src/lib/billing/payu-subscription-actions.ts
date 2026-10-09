"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { sendSubscriptionActivatedEmail, sendSubscriptionCancelledEmail } from "@/lib/billing/receipts";
import { isPlanId, PLANS, type PlanId } from "@/lib/plans/config";
import { buildMandateRegistrationFields, type MandateRegistrationFields } from "@/lib/billing/payu-subscription";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";

const BILLING_PATH = "/dashboard/billing";

// See payu-subscription.ts's file header — PayU subscriptions are monthly
// only here, so unlike Razorpay's IN_PROGRESS_STATUSES (which also had to
// account for a billing_interval mismatch), interval never varies.
const IN_PROGRESS_STATUSES = ["created", "authenticated", "active", "pending", "halted"];

export interface PayUSubscriptionCheckoutState {
  error?: string;
  payuFields?: MandateRegistrationFields;
  payuActionUrl?: string;
}

// Called from the Billing page. Unlike Razorpay's subscriptions.create
// (one API call that returns a reusable subscription_id), PayU's mandate
// registration is a single one-time hash-checkout POST — there's no
// separate "create" step and no id to reuse if the customer abandons it,
// so retrying always builds fresh fields against a new txnid.
export async function startPayUSubscriptionCheckout(planId: string, vpa: string): Promise<PayUSubscriptionCheckoutState> {
  const user = await requireUser();
  const [profile, membership] = await Promise.all([getProfile(), requireOrganization()]);

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage billing." };
  }
  if (!isPlanId(planId)) {
    return { error: "Select a valid plan." };
  }
  const trimmedVpa = vpa.trim();
  if (!trimmedVpa.includes("@")) {
    return { error: "Enter a valid UPI ID (e.g. yourname@bank)." };
  }

  const existing = await getOrganizationSubscription(membership.organization.id);
  if (existing && IN_PROGRESS_STATUSES.includes(existing.status)) {
    const samePlan = existing.plan_id === planId && existing.billing_interval === "monthly";
    return {
      error: samePlan
        ? "You're already subscribed to this plan."
        : "Cancel your current subscription before switching plans.",
    };
  }

  const plan = PLANS[planId as PlanId];
  const txnid = `sub${Date.now()}${membership.organization.id.replace(/-/g, "").slice(0, 8)}`;
  const siteUrl = getSiteUrl();
  const returnUrl = `${siteUrl}/api/payu/subscription/mandate-return?organizationId=${membership.organization.id}&planId=${planId}`;

  // "Until cancelled," approximated the same way the Razorpay flow's
  // TOTAL_COUNT_BY_INTERVAL does (120 monthly cycles ≈ 10 years) — PayU's
  // si_details needs a concrete end date rather than a cycle count.
  const today = new Date();
  const endDate = new Date(today);
  endDate.setFullYear(endDate.getFullYear() + 10);

  let built;
  try {
    built = buildMandateRegistrationFields({
      txnid,
      amountRupees: plan.priceInRupees,
      productinfo: `${plan.name} plan subscription (Monthly)`,
      firstname: profile ? profile.first_name : membership.organization.name,
      email: profile?.email ?? user.email ?? "",
      phone: profile?.phone ?? "9999999999",
      vpa: trimmedVpa,
      surl: returnUrl,
      furl: returnUrl,
      udf1: `sub:${membership.organization.id}`,
      paymentStartDate: today.toISOString().slice(0, 10),
      paymentEndDate: endDate.toISOString().slice(0, 10),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start checkout. Please try again." };
  }

  const admin = createAdminClient();
  const { error: upsertError } = await admin.from("organization_subscriptions").upsert(
    {
      organization_id: membership.organization.id,
      plan_id: planId,
      billing_interval: "monthly",
      status: "created",
      payu_txnid: txnid,
      payu_vpa: trimmedVpa,
    },
    { onConflict: "organization_id" },
  );
  if (upsertError) {
    console.error("organization_subscriptions upsert failed:", upsertError.message);
    return { error: "Couldn't start checkout. Please try again." };
  }

  revalidatePath(BILLING_PATH);
  return { payuFields: built.fields, payuActionUrl: built.actionUrl };
}

export interface FinalizeMandateResult {
  error?: string;
  success?: boolean;
}

// Called only from the mandate-return route, after it has verified PayU's
// hash. The mandate is now live — this just records that and activates
// the plan; it does NOT charge anything (UPI Autopay collects no money at
// registration time, only on each subsequent recurring-charge call). The
// subscription-billing cron is what actually starts charging, from
// next_charge_at.
export async function finalizePayUMandateRegistration(
  organizationId: string,
  txnid: string,
  authpayuid: string,
): Promise<FinalizeMandateResult> {
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("organization_subscriptions")
    .select("id, plan_id, billing_interval, status")
    .eq("organization_id", organizationId)
    .eq("payu_txnid", txnid)
    .maybeSingle();

  if (!subscription) {
    return { error: "That subscription could not be found." };
  }
  if (subscription.status === "active") {
    return { success: true };
  }

  const nextChargeAt = new Date();
  nextChargeAt.setMonth(nextChargeAt.getMonth() + 1);

  const { data: claimed } = await admin
    .from("organization_subscriptions")
    .update({
      status: "active",
      payu_authpayuid: authpayuid,
      current_start: new Date().toISOString(),
      next_charge_at: nextChargeAt.toISOString(),
      consecutive_charge_failures: 0,
    })
    .eq("id", subscription.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { success: true };
  }

  await admin.from("organizations").update({ plan: subscription.plan_id }).eq("id", organizationId);

  const planName = isPlanId(subscription.plan_id) ? PLANS[subscription.plan_id].name : subscription.plan_id;
  await sendSubscriptionActivatedEmail(organizationId, planName, "monthly");

  return { success: true };
}

export interface CancelPayUSubscriptionState {
  error?: string;
  success?: boolean;
}

// Unlike Razorpay's cancelSubscription, there's no "revoke the mandate on
// PayU's side" API call here — that PayU endpoint isn't confirmed (see
// payu-subscription.ts's file header), so this deliberately only stops
// OUR OWN side from ever calling the Recurring Payment Transaction API
// again (clearing next_charge_at), rather than risk calling an unverified
// revoke API. The practical effect for the customer is identical (no more
// charges); the mandate itself may still exist on their bank/UPI app
// until it expires or they cancel it there, which is a known limitation
// to revisit once this integration is verified against a real account.
export async function cancelPayUSubscription(): Promise<CancelPayUSubscriptionState> {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage billing." };
  }

  const existing = await getOrganizationSubscription(membership.organization.id);
  if (!existing?.payu_txnid) {
    return { error: "There's no subscription to cancel." };
  }

  const admin = createAdminClient();
  await Promise.all([
    admin
      .from("organization_subscriptions")
      .update({ status: "cancelled", next_charge_at: null })
      .eq("organization_id", membership.organization.id),
    admin.from("organizations").update({ plan: "basic" }).eq("id", membership.organization.id),
  ]);

  if (existing.status === "active") {
    const planName = isPlanId(existing.plan_id) ? PLANS[existing.plan_id].name : existing.plan_id;
    await sendSubscriptionCancelledEmail(membership.organization.id, planName);
  }

  await logPlatformEvent({
    level: "info",
    source: "subscription_billing",
    message: "PayU subscription cancelled locally — the UPI Autopay mandate itself is not revoked on PayU's side (unverified API, see payu-subscription.ts)",
    organizationId: membership.organization.id,
  });

  revalidatePath(BILLING_PATH);
  return { success: true };
}
