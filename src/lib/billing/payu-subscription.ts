import "server-only";

// Plan subscriptions on PayU, via UPI Autopay — see the long comment on
// migration 0119 and on buildSIRequestHashString (src/lib/payu/hash.ts)
// for why this whole file is architecturally different from every other
// PayU flow in this app, and IMPORTANT: none of the exact PayU field
// names/formulas below have been verified against a live call, unlike
// every other PayU integration in this app — this org doesn't have
// Standing Instructions/Subscriptions approved on PayU yet. Treat this as
// a best-effort implementation from PayU's documentation, to be checked
// against a real sandbox the moment that approval comes through.
//
// Scope: MONTHLY billing only. UPI Autopay caps a single "subscriptions"-
// category recurring debit at ₹15,000 without extra per-charge PIN entry
// (NPCI rule) — Starter/Growth/Pro's monthly prices (₹1,499/₹2,999/₹4,999)
// are comfortably under that, but two of the three ANNUAL prices
// (₹29,999, ₹49,999) are not. Annual billing would need a different
// mandate method (cards, or UPI with per-charge PIN) that hasn't been
// built — so startPayUSubscriptionCheckout only accepts "monthly".

import { createHash } from "node:crypto";
import { getPayUEnv, getPayUPostServiceBaseUrl } from "@/lib/payu/env";
import { buildSIRequestHashString, buildResponseHashString, sha512Hex, type PayUResponseHashFields } from "@/lib/payu/hash";

export const UPI_AUTOPAY_MAX_AMOUNT_RUPEES = 15000;

export interface SIDetails {
  paymentStartDate: string; // YYYY-MM-DD
  paymentEndDate: string; // YYYY-MM-DD
  billingAmount: string; // two decimals, no currency symbol — same format as the plain `amount` field
  billingCurrency: "INR";
  billingCycle: "MONTHLY";
  billingInterval: number; // 1 = every month
  billingRule: "MAX"; // charge up to billingAmount, never more
}

export interface BuildMandateRegistrationInput {
  txnid: string;
  amountRupees: number;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  vpa: string;
  surl: string;
  furl: string;
  udf1?: string;
  paymentStartDate: string;
  paymentEndDate: string;
}

export interface MandateRegistrationFields {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  udf1: string;
  pg: "UPI";
  bankcode: "UPITPV"; // "collect" flow — the customer enters their own VPA, works the same on desktop and mobile (unlike "intent", which needs a UPI app on the same device)
  vpa: string;
  si: "1";
  si_details: string; // JSON string, see SIDetails
  api_version: "7";
  hash: string;
}

function formatAmount(rupees: number): string {
  return rupees.toFixed(2);
}

export function buildMandateRegistrationFields(input: BuildMandateRegistrationInput): {
  fields: MandateRegistrationFields;
  actionUrl: string;
} {
  if (input.amountRupees > UPI_AUTOPAY_MAX_AMOUNT_RUPEES) {
    throw new Error(`UPI Autopay mandates can't exceed ₹${UPI_AUTOPAY_MAX_AMOUNT_RUPEES.toLocaleString("en-IN")}.`);
  }

  const { merchantKey, salt, baseUrl } = getPayUEnv();
  const amount = formatAmount(input.amountRupees);
  const udf1 = input.udf1 ?? "";

  const siDetails: SIDetails = {
    paymentStartDate: input.paymentStartDate,
    paymentEndDate: input.paymentEndDate,
    billingAmount: amount,
    billingCurrency: "INR",
    billingCycle: "MONTHLY",
    billingInterval: 1,
    billingRule: "MAX",
  };
  const siDetailsJson = JSON.stringify(siDetails);

  const hash = sha512Hex(
    buildSIRequestHashString(
      { key: merchantKey, txnid: input.txnid, amount, productinfo: input.productinfo, firstname: input.firstname, email: input.email, udf1 },
      siDetailsJson,
      salt,
    ),
  );

  return {
    fields: {
      key: merchantKey,
      txnid: input.txnid,
      amount,
      productinfo: input.productinfo,
      firstname: input.firstname,
      email: input.email,
      phone: input.phone,
      surl: input.surl,
      furl: input.furl,
      udf1,
      pg: "UPI",
      bankcode: "UPITPV",
      vpa: input.vpa,
      si: "1",
      si_details: siDetailsJson,
      api_version: "7",
      hash,
    },
    actionUrl: `${baseUrl}/_payment`,
  };
}

export interface MandateReturnFields {
  status: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  mihpayid?: string;
  si_details?: string;
  hash: string;
}

// Best-effort reverse-hash check for the mandate-registration return —
// see the file header. Fails closed (returns false) on anything that
// doesn't match, same as every other PayU verify function in this app, so
// a wrong formula here means a mandate registration silently isn't
// auto-confirmed rather than being wrongly trusted.
export function verifyMandateReturn(fields: MandateReturnFields): boolean {
  const { merchantKey, salt } = getPayUEnv();
  if (fields.hash.length === 0) return false;

  const responseFields: PayUResponseHashFields = {
    key: merchantKey,
    txnid: fields.txnid,
    amount: fields.amount,
    productinfo: fields.productinfo,
    firstname: fields.firstname,
    email: fields.email,
    udf1: fields.udf1,
    status: fields.status,
  };
  // Mirrors buildSIRequestHashString's insertion point: si_details slots in
  // right after the salt/status pair, before the reversed udf run — this
  // position is the LEAST confident part of this whole file; PayU's own
  // docs were inconsistent about where every field lands in this specific
  // reverse hash (see the file header).
  const base = buildResponseHashString(responseFields, salt);
  const withSiDetails = base.replace(`${salt}|${fields.status}|`, `${salt}|${fields.status}|${fields.si_details ?? ""}|`);
  return sha512Hex(withSiDetails).toLowerCase() === fields.hash.toLowerCase();
}

export interface RecurringChargeInput {
  authpayuid: string; // the mihpayid from the mandate-registration transaction
  amountRupees: number;
  txnid: string;
  email?: string;
  phone?: string;
}

export interface RecurringChargeResult {
  success: boolean;
  status: string; // PayU's own status string (e.g. "captured", "failed", "pending") for logging
  raw: unknown;
}

// Calls PayU's Recurring Payment Transaction API — the API this app's own
// cron must call each billing cycle, since PayU doesn't auto-charge and
// push a webhook the way Razorpay Subscriptions does. hash formula
// (sha512(key|command|var1|salt)) was corroborated by multiple
// independent sources, unlike the mandate-return reverse hash above, but
// still not verified live.
export async function triggerRecurringCharge(input: RecurringChargeInput): Promise<RecurringChargeResult> {
  const { merchantKey, salt } = getPayUEnv();
  const var1 = JSON.stringify({
    authpayuid: input.authpayuid,
    amount: formatAmount(input.amountRupees),
    txnid: input.txnid,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
  });
  const hash = createHash("sha512").update(`${merchantKey}|si_transaction|${var1}|${salt}`, "utf8").digest("hex");

  const body = new URLSearchParams({ form: "2", key: merchantKey, command: "si_transaction", var1, hash });
  const response = await fetch(`${getPayUPostServiceBaseUrl()}/merchant/postservice?form=2`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const raw = await response.json().catch(() => null);
  const details = raw && typeof raw === "object" ? (raw as Record<string, unknown>).details : null;
  const txnDetails =
    details && typeof details === "object" ? (details as Record<string, unknown>)[input.txnid] : null;
  const status = txnDetails && typeof txnDetails === "object" ? String((txnDetails as Record<string, unknown>).status ?? "") : "";

  return { success: status === "captured", status: status || "unknown", raw };
}
