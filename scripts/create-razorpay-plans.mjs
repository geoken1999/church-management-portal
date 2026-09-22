// One-time setup: creates the six Razorpay Plans (3 tiers × monthly/
// annual) that startSubscriptionCheckout (src/lib/billing/actions.ts)
// creates Subscriptions against. Plans are near-static (amount/period/
// interval never change once billing is live), so they're provisioned
// once here rather than created on demand at checkout. Annual is 10%
// off 12× the monthly price (ANNUAL_DISCOUNT in src/lib/plans/config.ts).
//
// Usage (after setting RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in .env.local):
//   node --env-file=.env.local scripts/create-razorpay-plans.mjs
//
// Paste the printed plan_xxxxx IDs into .env.local. If you've already run
// this before adding annual billing, your existing RAZORPAY_PLAN_ID_BASIC
// / _PREMIUM / _PRO (monthly) still work as-is — you only need the new
// _ANNUAL lines this run prints. Safe to re-run, but it always creates
// new plans (Razorpay plans are immutable), so only take the lines for
// whichever ones you actually need (new ones, or replacing a price
// change).

import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first (see .env.example).");
  process.exit(1);
}

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

// Mirrors src/lib/plans/config.ts — kept as plain numbers here rather than
// importing that module, since it's a TypeScript file with a
// Next.js-specific "server-only" import this plain Node script can't load.
const ANNUAL_DISCOUNT = 0.1;
const TIERS = [
  { name: "Basic", monthlyRupees: 499, envPrefix: "RAZORPAY_PLAN_ID_BASIC" },
  { name: "Premium", monthlyRupees: 2499, envPrefix: "RAZORPAY_PLAN_ID_PREMIUM" },
  { name: "Pro", monthlyRupees: 6999, envPrefix: "RAZORPAY_PLAN_ID_PRO" },
];

async function createPlan({ name, period, interval, amountInRupees, envKey }) {
  const plan = await razorpay.plans.create({
    period,
    interval,
    item: {
      name: `KingdomFlow ${name} (${period})`,
      amount: amountInRupees * 100, // Razorpay amounts are in paise
      currency: "INR",
      description: `KingdomFlow ${name} plan — ₹${amountInRupees}/${period === "monthly" ? "month" : "year"}`,
    },
  });
  console.log(`${envKey}=${plan.id}`);
}

async function main() {
  console.log("Creating Razorpay plans...\n");

  for (const tier of TIERS) {
    const annualRupees = Math.round(tier.monthlyRupees * 12 * (1 - ANNUAL_DISCOUNT));
    await createPlan({
      name: tier.name,
      period: "monthly",
      interval: 1,
      amountInRupees: tier.monthlyRupees,
      envKey: tier.envPrefix,
    });
    await createPlan({
      name: tier.name,
      period: "yearly",
      interval: 1,
      amountInRupees: annualRupees,
      envKey: `${tier.envPrefix}_ANNUAL`,
    });
  }

  console.log("\nPaste whichever lines above you need into .env.local, then redeploy/restart.");
}

main().catch((err) => {
  console.error("\nFailed to create plans:", err.message ?? err);
  process.exit(1);
});
