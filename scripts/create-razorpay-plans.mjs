// One-time setup: creates the three Razorpay Plans that
// startSubscriptionCheckout (src/lib/billing/actions.ts) creates
// Subscriptions against. Plans are near-static (amount/period/interval
// never change once billing is live), so they're provisioned once here
// rather than created on demand at checkout.
//
// Usage (after setting RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in .env.local):
//   node --env-file=.env.local scripts/create-razorpay-plans.mjs
//
// Paste the three printed plan_xxxxx IDs into .env.local as
// RAZORPAY_PLAN_ID_BASIC / _PREMIUM / _PRO. Safe to re-run — it always
// creates new plans though, so only run it again if you intend to replace
// all three (e.g. changing prices, since Razorpay plans are immutable).

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
const TIERS = [
  { envKey: "RAZORPAY_PLAN_ID_BASIC", name: "Basic", amountInRupees: 499 },
  { envKey: "RAZORPAY_PLAN_ID_PREMIUM", name: "Premium", amountInRupees: 2499 },
  { envKey: "RAZORPAY_PLAN_ID_PRO", name: "Pro", amountInRupees: 6999 },
];

async function main() {
  console.log("Creating Razorpay plans...\n");

  for (const tier of TIERS) {
    const plan = await razorpay.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: `KingdomFlow ${tier.name}`,
        amount: tier.amountInRupees * 100, // Razorpay amounts are in paise
        currency: "INR",
        description: `KingdomFlow ${tier.name} plan — ₹${tier.amountInRupees}/month`,
      },
    });
    console.log(`${tier.envKey}=${plan.id}`);
  }

  console.log("\nPaste the lines above into .env.local, then restart the dev server.");
}

main().catch((err) => {
  console.error("\nFailed to create plans:", err.message ?? err);
  process.exit(1);
});
