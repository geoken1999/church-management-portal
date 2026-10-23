// One-time setup: creates the six Razorpay Plans (3 tiers × monthly/
// annual) that startSubscriptionCheckout (src/lib/billing/actions.ts)
// creates Subscriptions against. Plans are near-static (amount/period/
// interval never change once billing is live), so they're provisioned
// once here rather than created on demand at checkout. Annual is
// nominally 17% off 12× the monthly price (ANNUAL_DISCOUNT in
// src/lib/plans/config.ts), but every tier here uses an explicit
// annualRupeesOverride instead — each one's advertised annual price is a
// few rupees off what the rounded formula alone would produce, mirroring
// config.ts's own tier() override mechanism.
//
// Each plan's amount is the listed price PLUS 18% GST, because that is what the church is charged every
// cycle (src/lib/billing/gst.ts) and what the checkout verifies the plan against before using it.
//
// Usage (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env.local decide test or live mode):
//   node --env-file=.env.local scripts/create-razorpay-plans.mjs            # shows what it would create
//   node --env-file=.env.local scripts/create-razorpay-plans.mjs --create   # creates the six plans
//
// Paste the printed RAZORPAY_PLAN_ID_* lines into .env.local and Vercel. Razorpay plans can't be edited or
// deleted, so create them once per mode; test plan ids do not exist in live mode.

import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first (see .env.example).");
  process.exit(1);
}

const create = process.argv.includes("--create");
const GST_RATE = 0.18;
// Whole paise, the way src/lib/billing/gst.ts works it out.
const withGstPaise = (rupees) => {
  const base = Math.round(rupees * 100);
  return base + Math.round(base * GST_RATE);
};

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

// Mirrors src/lib/plans/config.ts — kept as plain numbers here rather than
// importing that module, since it's a TypeScript file with a
// Next.js-specific "server-only" import this plain Node script can't load.
// envPrefix stays "RAZORPAY_PLAN_ID_BASIC"/"_PREMIUM"/"_PRO" — those are
// the internal plan ids (unchanged), not the display names.
const ANNUAL_DISCOUNT = 0.17;
const TIERS = [
  { name: "Starter", monthlyRupees: 1499, envPrefix: "RAZORPAY_PLAN_ID_BASIC", annualRupeesOverride: 14999 },
  { name: "Growth", monthlyRupees: 2999, envPrefix: "RAZORPAY_PLAN_ID_PREMIUM", annualRupeesOverride: 29999 },
  { name: "Pro", monthlyRupees: 4999, envPrefix: "RAZORPAY_PLAN_ID_PRO", annualRupeesOverride: 49999 },
];

async function createPlan({ name, period, interval, amountInRupees, envKey }) {
  const paise = withGstPaise(amountInRupees);
  const label = `${envKey}  KingdomFlow ${name} (${period}): ₹${amountInRupees} + GST = ₹${(paise / 100).toFixed(2)}`;
  if (!create) {
    console.log(`would create  ${label}`);
    return;
  }
  const plan = await razorpay.plans.create({
    period,
    interval,
    item: {
      name: `KingdomFlow ${name} (${period}, incl. GST)`,
      amount: paise, // Razorpay amounts are in paise
      currency: "INR",
      description: `KingdomFlow ${name} plan — ₹${amountInRupees} + 18% GST per ${period === "monthly" ? "month" : "year"}`,
    },
  });
  console.log(`${envKey}=${plan.id}`);
}

async function main() {
  console.log(create ? "Creating Razorpay plans...\n" : "Dry run (add --create to create them):\n");

  for (const tier of TIERS) {
    const annualRupees = tier.annualRupeesOverride ?? Math.round(tier.monthlyRupees * 12 * (1 - ANNUAL_DISCOUNT));
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

  if (create) console.log("\nPaste these lines into .env.local and the Vercel environment variables, then redeploy.");
}

main().catch((err) => {
  console.error("\nFailed to create plans:", err.message ?? err);
  process.exit(1);
});
