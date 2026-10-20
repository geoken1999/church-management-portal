import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/razorpay", () => ({ createRazorpayClient: () => ({}) }));
vi.mock("@/lib/billing/env", () => ({
  getRazorpayEnv: () => ({ keyId: "rzp_test_x", keySecret: "secret" }),
}));

import {
  confirmReturn,
  verifySignature,
  type RazorpayLookup,
} from "./platform";
import { toPaise } from "./checkout";

const SECRET = "test-secret";
const sign = (orderId: string, paymentId: string) =>
  crypto
    .createHmac("sha256", SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
const form = (fields: Record<string, string>) =>
  new Map(Object.entries(fields)) as unknown as {
    get(n: string): string | null;
  };
const lookup = (
  over: Partial<{
    receipt: string | null;
    orderOf: string;
    status: string;
  }> = {},
): RazorpayLookup & { captured: string[] } => {
  const captured: string[] = [];
  return {
    captured,
    fetchOrder: async (id) => ({
      id,
      receipt: over.receipt === undefined ? "addon123" : over.receipt,
      amount: 50000,
    }),
    fetchPayment: async (id) => ({
      id,
      order_id: over.orderOf ?? "order_1",
      status: over.status ?? "captured",
      amount: 50000,
    }),
    capturePayment: async (id) => void captured.push(id),
  };
};

describe("verifySignature", () => {
  it("accepts the right signature and rejects anything else", () => {
    expect(
      verifySignature("order_1", "pay_1", sign("order_1", "pay_1"), SECRET),
    ).toBe(true);
    expect(
      verifySignature("order_1", "pay_2", sign("order_1", "pay_1"), SECRET),
    ).toBe(false);
    expect(verifySignature("order_1", "pay_1", "short", SECRET)).toBe(false);
    expect(verifySignature("", "pay_1", sign("order_1", "pay_1"), SECRET)).toBe(
      false,
    );
  });
});

describe("confirmReturn", () => {
  const good = () =>
    form({
      razorpay_order_id: "order_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: sign("order_1", "pay_1"),
    });

  it("hands back our own reference for a captured payment", async () => {
    expect(await confirmReturn(good(), SECRET, lookup())).toEqual({
      ok: true,
      reference: "addon123",
      paymentId: "pay_1",
    });
  });
  it("captures an authorized payment before accepting it", async () => {
    const l = lookup({ status: "authorized" });
    expect(await confirmReturn(good(), SECRET, l)).toMatchObject({ ok: true });
    expect(l.captured).toEqual(["pay_1"]);
  });
  it("refuses a wrong signature without calling Razorpay's payment", async () => {
    const bad = form({
      razorpay_order_id: "order_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "0".repeat(64),
    });
    expect(await confirmReturn(bad, SECRET, lookup())).toEqual({
      ok: false,
      reason: "unverified",
    });
  });
  it("refuses a payment that belongs to a different order", async () => {
    expect(
      await confirmReturn(good(), SECRET, lookup({ orderOf: "order_other" })),
    ).toEqual({ ok: false, reason: "unverified" });
  });
  it("refuses an order with no reference of ours", async () => {
    expect(
      await confirmReturn(good(), SECRET, lookup({ receipt: null })),
    ).toEqual({ ok: false, reason: "unverified" });
  });
  it("treats an abandoned or failed payment as declined", async () => {
    expect(
      await confirmReturn(
        form({ "error[code]": "BAD_REQUEST_ERROR" }),
        SECRET,
        lookup(),
      ),
    ).toEqual({ ok: false, reason: "declined" });
    expect(
      await confirmReturn(good(), SECRET, lookup({ status: "failed" })),
    ).toEqual({ ok: false, reason: "declined" });
  });
  it("reports a payment that is not captured yet as pending, and junk as a bad request", async () => {
    expect(
      await confirmReturn(good(), SECRET, lookup({ status: "created" })),
    ).toEqual({ ok: false, reason: "pending" });
    expect(
      await confirmReturn(
        form({ razorpay_payment_id: "pay_1" }),
        SECRET,
        lookup(),
      ),
    ).toEqual({ ok: false, reason: "bad_request" });
  });
});

it("counts money in paise", () => {
  expect(toPaise(1768.82)).toBe(176882);
  expect(toPaise(499)).toBe(49900);
});
