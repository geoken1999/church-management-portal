import "server-only";

import { getPayUEnv } from "@/lib/payu/env";
import { buildRequestHashString, buildResponseHashString, sha512Hex, type PayUHashFields } from "@/lib/payu/hash";

// PayU India's checkout has no server-to-server "create order" call like
// Razorpay's orders.create(). Our server computes a hash over the
// transaction details; the browser then POSTs those fields directly to
// PayU's own hosted page (a full-page redirect, not a popup), and PayU
// redirects back to surl (success) or furl (failure) with a signed result.
// This function does the first half: it builds the exact field set the
// browser's form should submit, hash included.

export interface BuildPaymentRequestInput {
  txnid: string;
  amountRupees: number;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  // udf1 carries this app's own reference (e.g. "addon:<order-id>") so the
  // return handler can look the row up even if txnid alone isn't enough.
  udf1?: string;
}

export interface PayUFormFields {
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
  hash: string;
}

// PayU requires the amount in the hash to be formatted exactly as it will be
// submitted — two decimal places, no currency symbol or thousands separator.
function formatAmount(rupees: number): string {
  return rupees.toFixed(2);
}

export function buildPaymentRequestFields(input: BuildPaymentRequestInput): { fields: PayUFormFields; actionUrl: string } {
  const { merchantKey, salt, baseUrl } = getPayUEnv();
  const amount = formatAmount(input.amountRupees);
  const udf1 = input.udf1 ?? "";

  const hashFields: PayUHashFields = {
    key: merchantKey,
    txnid: input.txnid,
    amount,
    productinfo: input.productinfo,
    firstname: input.firstname,
    email: input.email,
    udf1,
  };
  const hash = sha512Hex(buildRequestHashString(hashFields, salt));

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
      hash,
    },
    actionUrl: `${baseUrl}/_payment`,
  };
}

export interface PayUReturnFields {
  status: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  mihpayid?: string;
  hash: string;
}

// Verifies the hash PayU attached to its redirect-back POST (surl/furl) or
// to an S2S webhook using the same field set. Returns false on any
// mismatch — the caller must treat that exactly like a failed payment,
// never partially trust it.
export function verifyPayUReturn(fields: PayUReturnFields): boolean {
  const { merchantKey, salt } = getPayUEnv();
  if (fields.hash.length === 0) return false;

  const expected = sha512Hex(
    buildResponseHashString(
      {
        key: merchantKey,
        txnid: fields.txnid,
        amount: fields.amount,
        productinfo: fields.productinfo,
        firstname: fields.firstname,
        email: fields.email,
        udf1: fields.udf1,
        status: fields.status,
      },
      salt,
    ),
  );
  return expected.toLowerCase() === fields.hash.toLowerCase();
}
