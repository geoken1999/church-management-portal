import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import { cashfreeReturnAsPost, cashfreeReturnUrl, cashfreeWebhookSignatureValid, confirmCashfreeReturn, type CashfreeLookup } from "./platform";

const lookup = (status: string, paymentId: string | null = "9001"): CashfreeLookup => ({
  orderStatus: async () => ({ status, amount: 100 }),
  successfulPaymentId: async () => paymentId,
});

describe("confirmCashfreeReturn", () => {
  it("is ok only when Cashfree says the order is PAID, and hands back our own reference", async () => {
    expect(await confirmCashfreeReturn("giving123abc", lookup("PAID"))).toEqual({ ok: true, reference: "giving123abc", paymentId: "9001" });
  });
  it("falls back to the order id when the payment id can't be read", async () => {
    expect(await confirmCashfreeReturn("giving123abc", lookup("PAID", null))).toEqual({ ok: true, reference: "giving123abc", paymentId: "giving123abc" });
  });
  it("treats an unpaid or abandoned order as declined", async () => {
    for (const status of ["ACTIVE", "EXPIRED", "TERMINATED"]) {
      expect(await confirmCashfreeReturn("giving123abc", lookup(status))).toEqual({ ok: false, reason: "declined" });
    }
  });
  it("treats an unknown status as still pending", async () => {
    expect(await confirmCashfreeReturn("giving123abc", lookup("SOMETHING_NEW"))).toEqual({ ok: false, reason: "pending" });
  });
  it("can't be verified when Cashfree can't be asked", async () => {
    const broken: CashfreeLookup = { orderStatus: async () => ({ error: "down" }), successfulPaymentId: async () => null };
    expect(await confirmCashfreeReturn("giving123abc", broken)).toEqual({ ok: false, reason: "unverified" });
  });
  it("rejects an order id that isn't one of ours in shape", async () => {
    for (const id of ["", "has space", "a/b", "x".repeat(51)]) {
      expect(await confirmCashfreeReturn(id, lookup("PAID"))).toEqual({ ok: false, reason: "bad_request" });
    }
  });
});

describe("cashfreeReturnUrl", () => {
  it("adds Cashfree's order placeholder, whether or not the address already has a query", () => {
    expect(cashfreeReturnUrl("https://x.in/api/razorpay/giving/return?token=t")).toBe("https://x.in/api/razorpay/giving/return?token=t&order_id={order_id}");
    expect(cashfreeReturnUrl("https://x.in/api/razorpay/addon/return")).toBe("https://x.in/api/razorpay/addon/return?order_id={order_id}");
  });
});

describe("cashfreeReturnAsPost", () => {
  it("hands the route a POST whose form carries the order id", async () => {
    let seen: { method: string; orderId: string | null } | null = null;
    await cashfreeReturnAsPost(new Request("https://x.in/r?token=t&order_id=abc123"), async (request) => {
      const form = await request.formData();
      seen = { method: request.method, orderId: String(form.get("cf_order_id")) };
      return new Response(null, { status: 303 });
    });
    expect(seen).toEqual({ method: "POST", orderId: "abc123" });
  });
});

describe("cashfreeWebhookSignatureValid", () => {
  const sign = (timestamp: string, body: string, secret: string) => crypto.createHmac("sha256", secret).update(timestamp + body).digest("base64");
  it("accepts Cashfree's signature over timestamp + body", () => {
    expect(cashfreeWebhookSignatureValid('{"a":1}', "1700000000", sign("1700000000", '{"a":1}', "sk"), "sk")).toBe(true);
  });
  it("rejects a changed body, timestamp or key, and empty input", () => {
    const good = sign("1700000000", '{"a":1}', "sk");
    expect(cashfreeWebhookSignatureValid('{"a":2}', "1700000000", good, "sk")).toBe(false);
    expect(cashfreeWebhookSignatureValid('{"a":1}', "1700000001", good, "sk")).toBe(false);
    expect(cashfreeWebhookSignatureValid('{"a":1}', "1700000000", good, "other")).toBe(false);
    expect(cashfreeWebhookSignatureValid("", "", "", "sk")).toBe(false);
  });
});
