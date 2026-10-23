import "server-only";

import crypto from "node:crypto";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { getRazorpayEnv } from "@/lib/billing/env";
import {
  toPaise,
  type RazorpaySubscriptionCheckout,
} from "@/lib/razorpay/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanId, PLANS, type BillingInterval } from "@/lib/plans/config";
import { planMismatch, totalCountFor } from "@/lib/billing/razorpay-plans";
import { withGst } from "@/lib/billing/gst";
import { sendSubscriptionActivatedEmail } from "@/lib/billing/receipts";
import { applyOnboardingModules } from "@/lib/onboarding/store";
import { cleanCredits } from "@/lib/onboarding/config";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { issueAndEmailInvoice } from "@/lib/invoices/issue";
import { planNameFor } from "@/lib/billing/cancellation-store";

// Subscriptions on KingdomFlow's own Razorpay account. A church's plan (or the custom amount of a tenant
// onboarding) is charged monthly, including 18% GST, by Razorpay itself: the church authorises once in
// Razorpay's checkout (UPI Autopay, card or e-mandate, their choice) and Razorpay collects every cycle and
// tells us through the webhook (src/app/api/razorpay/webhook/route.ts).

export function subscriptionSignatureValid(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string = getRazorpayEnv().keySecret,
): boolean {
  if (!paymentId || !subscriptionId || !signature) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Starts a subscription. With `razorpayPlanId` (a standard plan made once in the Razorpay Dashboard) the
 * subscription goes on that plan, after checking its price and cycle are what we are about to sell; without
 * one (a custom tenant amount, a plan not set up yet, or one that doesn't match) a plan is created for this checkout.
 * `totalRupees` is what the church pays each cycle with GST.
 */
export async function createSubscriptionCheckout(input: {
  organizationId: string;
  planLabel: string;
  interval?: BillingInterval;
  razorpayPlanId?: string | null;
  totalRupees: number;
  prefill: RazorpaySubscriptionCheckout["prefill"];
  callbackUrl: string;
  notes: Record<string, string>;
}): Promise<{
  checkout: RazorpaySubscriptionCheckout;
  subscriptionId: string;
  status: string;
  shortUrl: string | null;
}> {
  const { keyId } = getRazorpayEnv();
  const client = createRazorpayClient();
  const interval = input.interval ?? "monthly";
  let planId: string | null = null;
  if (input.razorpayPlanId) {
    // A fixed plan whose price or cycle is not what we sell (set up before a price change, or from the wrong
    // Razorpay mode) is not used: the church is charged the right amount on a plan made for this checkout, and
    // the problem is logged for the platform owner (it also shows on the Health page).
    try {
      const fixed = await client.plans.fetch(input.razorpayPlanId);
      const problem = planMismatch(
        fixed as unknown as Parameters<typeof planMismatch>[0],
        interval,
        toPaise(input.totalRupees),
      );
      if (problem) throw new Error(problem);
      planId = fixed.id;
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: `Razorpay plan ${input.razorpayPlanId} can't be used: ${err instanceof Error ? err.message : "unknown error"}. A plan was created for this checkout instead; fix the plan id in the environment variables.`,
        organizationId: input.organizationId,
      });
    }
  }
  if (!planId) {
    const created = await client.plans.create({
      period: interval === "annual" ? "yearly" : "monthly",
      interval: 1,
      item: {
        name: `${input.planLabel} (${interval === "annual" ? "yearly" : "monthly"}, incl. GST)`.slice(0, 100),
        amount: toPaise(input.totalRupees),
        currency: "INR",
      },
    });
    planId = created.id;
  }
  const subscription = await client.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: totalCountFor(interval),
    notes: { organization_id: input.organizationId, ...input.notes },
  });
  return {
    subscriptionId: subscription.id,
    status: String(subscription.status),
    shortUrl: subscription.short_url ?? null,
    checkout: {
      keyId,
      subscriptionId: subscription.id,
      name: "KingdomFlow",
      description: input.planLabel,
      prefill: input.prefill,
      callbackUrl: input.callbackUrl,
    },
  };
}

const toIso = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

export interface SubscriptionEntity {
  id: string;
  status?: string;
  customer_id?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
}

/**
 * The church's authorisation went through: switch the plan (or the onboarding modules) on. Safe to call
 * twice, from the return route and from the webhook; only the first call that finds the subscription not
 * yet live does the work. The first charge itself arrives separately as subscription.charged.
 */
export async function activateRazorpaySubscription(
  subscriptionId: string,
  entity?: SubscriptionEntity,
): Promise<{ error?: string; success?: boolean }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("organization_subscriptions")
    .select(
      "id, organization_id, plan_id, billing_interval, status, monthly_amount, onboarding_modules, onboarding_credits",
    )
    .eq("razorpay_subscription_id", subscriptionId)
    .maybeSingle();
  if (!row) return { error: "That subscription could not be found." };
  if (row.status === "active") return { success: true };

  let live = entity;
  if (!live) {
    const fetched =
      await createRazorpayClient().subscriptions.fetch(subscriptionId);
    live = fetched as unknown as SubscriptionEntity;
  }

  const { data: claimed } = await admin
    .from("organization_subscriptions")
    .update({
      status: "active",
      razorpay_customer_id: live.customer_id ?? undefined,
      current_start: toIso(live.current_start) ?? new Date().toISOString(),
      current_end: toIso(live.current_end),
      next_charge_at: toIso(live.charge_at),
      consecutive_charge_failures: 0,
      // A church that came over from the old PayU billing is on Razorpay from now on.
      payu_authpayuid: null,
    })
    .eq("id", row.id)
    .in("status", ["created", "authenticated", "pending", "halted"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { success: true };

  if (row.monthly_amount !== null && row.onboarding_modules) {
    await applyOnboardingModules(
      row.organization_id,
      row.onboarding_modules,
      cleanCredits(row.onboarding_credits),
    );
    const now = new Date().toISOString();
    await admin
      .from("tenant_onboarding")
      .update({ status: "active", activated_at: now, updated_at: now })
      .eq("organization_id", row.organization_id);
    await sendSubscriptionActivatedEmail(
      row.organization_id,
      "KingdomFlow modules",
      "monthly",
    );
    return { success: true };
  }

  await admin
    .from("organizations")
    .update({ plan: row.plan_id })
    .eq("id", row.organization_id);
  await sendSubscriptionActivatedEmail(
    row.organization_id,
    planNameFor(row.plan_id, null),
    row.billing_interval === "annual" ? "annual" : "monthly",
  );
  return { success: true };
}

/**
 * One successful monthly charge (webhook subscription.charged): the payment record, the charge row, and the
 * tax invoice emailed to the church. Keyed on the payment id so a redelivered webhook changes nothing.
 * Returns true only the first time, so the caller sends the receipt email once.
 */
export async function recordSubscriptionCharge(input: {
  subscriptionRowId: string;
  organizationId: string;
  planId: string;
  interval?: BillingInterval;
  monthlyAmount: number | null;
  razorpaySubscriptionId: string;
  paymentId: string;
  amountPaise: number;
  paidAt: string;
  raw: Record<string, unknown>;
}): Promise<boolean> {
  const admin = createAdminClient();
  const customAmount =
    input.monthlyAmount !== null && input.monthlyAmount !== undefined
      ? Number(input.monthlyAmount)
      : null;
  const annual = input.interval === "annual" && customAmount === null;
  const base =
    customAmount ??
    (isPlanId(input.planId)
      ? annual
        ? PLANS[input.planId].priceInRupeesAnnual
        : PLANS[input.planId].priceInRupees
      : null);
  const price = base !== null ? withGst(base) : null;

  await admin.from("platform_subscription_payments").upsert(
    {
      organization_id: input.organizationId,
      razorpay_subscription_id: input.razorpaySubscriptionId,
      razorpay_payment_id: input.paymentId,
      plan_id: input.planId,
      amount: input.amountPaise / 100,
      currency: "INR",
      paid_at: input.paidAt,
    },
    { onConflict: "razorpay_payment_id", ignoreDuplicates: true },
  );

  const { data: inserted } = await admin
    .from("subscription_charges")
    .upsert(
      {
        organization_id: input.organizationId,
        subscription_id: input.subscriptionRowId,
        txnid: input.paymentId,
        amount: input.amountPaise / 100,
        gst_amount: price?.gst ?? 0,
        status: "charged",
        payu_response: input.raw as never,
        charged_at: input.paidAt,
      },
      { onConflict: "txnid", ignoreDuplicates: true },
    )
    .select("id");
  if (!inserted || inserted.length === 0) return false;

  const invoiceId = price
    ? await issueAndEmailInvoice({
        organizationId: input.organizationId,
        kind: "subscription",
        reference: input.paymentId,
        description:
          customAmount !== null
            ? "KingdomFlow modules subscription (monthly)"
            : `${planNameFor(input.planId, null)} plan subscription (${annual ? "annual" : "monthly"})`,
        baseAmount: price.base,
      })
    : null;
  if (invoiceId)
    await admin
      .from("subscription_charges")
      .update({ invoice_id: invoiceId })
      .eq("txnid", input.paymentId);
  return true;
}
