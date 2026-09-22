import "server-only";

import type { PlanId } from "@/lib/plans/config";

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

// Each tier maps to a Razorpay Plan created once via
// scripts/create-razorpay-plans.mjs (or the Razorpay Dashboard) — Plans
// are near-static (amount/period/interval), so they're provisioned ahead
// of time rather than created on demand at checkout.
const RAZORPAY_PLAN_ENV_KEYS: Record<PlanId, string> = {
  basic: "RAZORPAY_PLAN_ID_BASIC",
  premium: "RAZORPAY_PLAN_ID_PREMIUM",
  pro: "RAZORPAY_PLAN_ID_PRO",
};

export function getRazorpayPlanId(planId: PlanId): string {
  const envKey = RAZORPAY_PLAN_ENV_KEYS[planId];
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`${envKey} must be set — run scripts/create-razorpay-plans.mjs to create it.`);
  }
  return value;
}

export function planIdForRazorpayPlanId(razorpayPlanId: string): PlanId | null {
  for (const [planId, envKey] of Object.entries(RAZORPAY_PLAN_ENV_KEYS) as [PlanId, string][]) {
    if (process.env[envKey] === razorpayPlanId) return planId;
  }
  return null;
}
