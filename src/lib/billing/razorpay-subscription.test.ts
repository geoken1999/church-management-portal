import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { subscriptionSignatureValid } from "./razorpay-subscription";

const sign = (payment: string, subscription: string, secret: string) =>
  crypto
    .createHmac("sha256", secret)
    .update(`${payment}|${subscription}`)
    .digest("hex");

describe("subscription return signature", () => {
  it("accepts Razorpay's signature (payment id first, then subscription id)", () => {
    expect(
      subscriptionSignatureValid(
        "pay_1",
        "sub_1",
        sign("pay_1", "sub_1", "secret"),
        "secret",
      ),
    ).toBe(true);
  });
  it("rejects another subscription, another secret, or nothing", () => {
    const good = sign("pay_1", "sub_1", "secret");
    expect(subscriptionSignatureValid("pay_1", "sub_2", good, "secret")).toBe(
      false,
    );
    expect(subscriptionSignatureValid("pay_1", "sub_1", good, "other")).toBe(
      false,
    );
    expect(subscriptionSignatureValid("pay_1", "sub_1", "", "secret")).toBe(
      false,
    );
    expect(subscriptionSignatureValid("", "sub_1", good, "secret")).toBe(false);
  });
});
