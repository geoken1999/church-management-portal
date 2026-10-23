// The Razorpay plans (price + billing cycle) KingdomFlow's standard plans are sold on. A plan is created once in
// the Razorpay Dashboard (Subscriptions → Plans) and its id is kept in an environment variable, one per
// plan and cycle. Plain functions (no server code) so they can be tested.
import type { BillingInterval, PlanId } from "@/lib/plans/config";
import { PLANS } from "@/lib/plans/config";
import { withGst } from "@/lib/billing/gst";

export const PLAN_ENV_NAMES: Record<PlanId, string> = {
  basic: "BASIC",
  premium: "PREMIUM",
  pro: "PRO",
};

/** The environment variable holding the Razorpay plan id for a plan and cycle, e.g. RAZORPAY_PLAN_ID_PREMIUM_ANNUAL. */
export function planEnvVar(planId: PlanId, interval: BillingInterval): string {
  return `RAZORPAY_PLAN_ID_${PLAN_ENV_NAMES[planId]}${interval === "annual" ? "_ANNUAL" : ""}`;
}

/** The plan id from the environment, or null when that plan isn't set up (the checkout then creates one itself). */
export function razorpayPlanIdFor(
  planId: PlanId,
  interval: BillingInterval,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env[planEnvVar(planId, interval)]?.trim();
  return value ? value : null;
}

/** What a church pays each cycle for a standard plan: the listed price plus 18% GST, in paise. */
export function expectedChargePaise(
  planId: PlanId,
  interval: BillingInterval,
): number {
  const plan = PLANS[planId];
  const base = interval === "annual" ? plan.priceInRupeesAnnual : plan.priceInRupees;
  return Math.round(withGst(base).total * 100);
}

export interface RazorpayPlanLike {
  period?: string;
  interval?: number;
  item?: { amount?: number; currency?: string };
}

/**
 * Checks a plan fetched from Razorpay against what we are about to sell. A wrong amount or cycle would charge a
 * church the wrong money, so the checkout stops instead. Returns a sentence for the log, or null when it matches.
 */
export function planMismatch(
  plan: RazorpayPlanLike,
  interval: BillingInterval,
  expectedPaise: number,
): string | null {
  const period = interval === "annual" ? "yearly" : "monthly";
  if (plan.period !== period || plan.interval !== 1)
    return `the plan bills every ${plan.interval ?? "?"} ${plan.period ?? "?"}, not every 1 ${period}`;
  if (plan.item?.currency && plan.item.currency !== "INR")
    return `the plan is in ${plan.item.currency}, not INR`;
  if (plan.item?.amount !== expectedPaise)
    return `the plan charges ${plan.item?.amount ?? "?"} paise, expected ${expectedPaise} (price plus 18% GST)`;
  return null;
}

/** How many charges a subscription runs for: "until cancelled", as a finite count of 10 years. */
export function totalCountFor(interval: BillingInterval): number {
  return interval === "annual" ? 10 : 120;
}
