import { describe, expect, it } from "vitest";
import { gatewayAttemptOrder, isPlatformGateway, otherGateway } from "@/lib/payments/gateway-policy";

const both = { razorpay: true, cashfree: true };

describe("gatewayAttemptOrder", () => {
  it("tries the primary, then the other when failover is on", () => {
    expect(gatewayAttemptOrder({ primary: "razorpay", failover: true }, both)).toEqual(["razorpay", "cashfree"]);
    expect(gatewayAttemptOrder({ primary: "cashfree", failover: true }, both)).toEqual(["cashfree", "razorpay"]);
  });
  it("tries only the primary when failover is off", () => {
    expect(gatewayAttemptOrder({ primary: "razorpay", failover: false }, both)).toEqual(["razorpay"]);
  });
  it("never tries a gateway that has no keys", () => {
    expect(gatewayAttemptOrder({ primary: "razorpay", failover: true }, { razorpay: true, cashfree: false })).toEqual(["razorpay"]);
  });
  it("uses the other gateway when the primary isn't set up, even with failover off", () => {
    expect(gatewayAttemptOrder({ primary: "cashfree", failover: false }, { razorpay: true, cashfree: false })).toEqual(["razorpay"]);
  });
  it("is empty when neither is set up", () => {
    expect(gatewayAttemptOrder({ primary: "razorpay", failover: true }, { razorpay: false, cashfree: false })).toEqual([]);
  });
});

describe("helpers", () => {
  it("knows its gateways", () => {
    expect(isPlatformGateway("cashfree")).toBe(true);
    expect(isPlatformGateway("payu")).toBe(false);
    expect(otherGateway("razorpay")).toBe("cashfree");
  });
});
