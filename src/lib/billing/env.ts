import "server-only";

import type { PlanId, BillingInterval } from "@/lib/plans/config";

export function getRazorpayEnv() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set to manage subscriptions.");
  }

  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayWebhookSecret(): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET must be set to verify Razorpay webhook events.");
  }
  return secret;
}

// Each (tier, interval) pair maps to a Razorpay Plan created once via
// scripts/create-razorpay-plans.mjs (or the Razorpay Dashboard) — Plans
// are near-static (amount/period/interval), so they're provisioned ahead
// of time rather than created on demand at checkout. Monthly keeps the
// original (suffix-less) env var names from before annual billing
// existed, so an already-configured monthly plan ID keeps working as-is.
const RAZORPAY_PLAN_ENV_KEYS: Record<PlanId, Record<BillingInterval, string>> = {
  basic: { monthly: "RAZORPAY_PLAN_ID_BASIC", annual: "RAZORPAY_PLAN_ID_BASIC_ANNUAL" },
  premium: { monthly: "RAZORPAY_PLAN_ID_PREMIUM", annual: "RAZORPAY_PLAN_ID_PREMIUM_ANNUAL" },
  pro: { monthly: "RAZORPAY_PLAN_ID_PRO", annual: "RAZORPAY_PLAN_ID_PRO_ANNUAL" },
};

export function getRazorpayPlanId(planId: PlanId, interval: BillingInterval): string {
  const envKey = RAZORPAY_PLAN_ENV_KEYS[planId][interval];
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`${envKey} must be set — run scripts/create-razorpay-plans.mjs to create it.`);
  }
  return value;
}
