// PayU India's classic hash scheme. No server-session/DB imports — only
// Node's crypto module, available in both this app's server runtime and the
// Vitest (Node) test environment, never in a browser bundle — so the exact
// field order is directly testable without a sandbox call. The order was
// verified against PayU's live test API before this was written: a Verify
// Payment call and a real payment-initiate POST to test.payu.in both used
// this formula and were accepted (not rejected as a hash mismatch).

import { createHash } from "node:crypto";
//
// Request hash: key|txnid|amount|productinfo|firstname|email|udf1..udf5
// then five empty udf6..udf10 slots, then the salt. PayU's udf6-10 are
// reserved and always sent empty by this app, hence the fixed trailing run
// of empty strings.
//
// Response/webhook hash is the exact reverse: salt|status|(empty
// udf10..udf6)|udf5..udf1|email|firstname|productinfo|amount|txnid|key.

export interface PayUHashFields {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

export function buildRequestHashString(fields: PayUHashFields, salt: string): string {
  return [
    fields.key,
    fields.txnid,
    fields.amount,
    fields.productinfo,
    fields.firstname,
    fields.email,
    fields.udf1 ?? "",
    fields.udf2 ?? "",
    fields.udf3 ?? "",
    fields.udf4 ?? "",
    fields.udf5 ?? "",
    "",
    "",
    "",
    "",
    "",
    salt,
  ].join("|");
}

export interface PayUResponseHashFields extends PayUHashFields {
  status: string;
}

export function buildResponseHashString(fields: PayUResponseHashFields, salt: string): string {
  return [
    salt,
    fields.status,
    "",
    "",
    "",
    "",
    "",
    fields.udf5 ?? "",
    fields.udf4 ?? "",
    fields.udf3 ?? "",
    fields.udf2 ?? "",
    fields.udf1 ?? "",
    fields.email,
    fields.firstname,
    fields.productinfo,
    fields.amount,
    fields.txnid,
    fields.key,
  ].join("|");
}

export function sha512Hex(input: string): string {
  return createHash("sha512").update(input, "utf8").digest("hex");
}
