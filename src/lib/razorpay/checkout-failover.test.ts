import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  policy: { primary: "razorpay" as "razorpay" | "cashfree", failover: true },
  razorpayConfigured: true,
  cashfreeConfigured: true,
  razorpayFails: false,
  cashfreeFails: false,
  log: vi.fn(),
}));

vi.mock("@/lib/billing/razorpay", () => ({
  createRazorpayClient: () => ({
    orders: {
      create: async () => {
        if (state.razorpayFails) throw new Error("Razorpay is down");
        return { id: "order_rzp" };
      },
    },
  }),
}));
vi.mock("@/lib/billing/env", () => ({
  getRazorpayEnv: () => ({ keyId: "rzp_test_x", keySecret: "secret" }),
  isRazorpayConfigured: () => state.razorpayConfigured,
}));
vi.mock("@/lib/payments/gateway-settings", () => ({ getGatewayPolicy: async () => state.policy }));
vi.mock("@/lib/cashfree/platform", () => ({
  isPlatformCashfreeConfigured: () => state.cashfreeConfigured,
  confirmCashfreeReturn: vi.fn(),
  createPlatformCashfreeCheckout: async () => {
    if (state.cashfreeFails) throw new Error("Cashfree is down");
    return { gateway: "cashfree", cashfree: { paymentSessionId: "s", mode: "production" } };
  },
}));
vi.mock("@/lib/platform-events/log", () => ({ logPlatformEvent: (e: unknown) => state.log(e) }));

import { createCheckout } from "./platform";

const input = { receipt: "giving1", amountRupees: 100, name: "N", description: "D", callbackUrl: "https://x.in/cb" };

beforeEach(() => {
  Object.assign(state, { policy: { primary: "razorpay", failover: true }, razorpayConfigured: true, cashfreeConfigured: true, razorpayFails: false, cashfreeFails: false });
  state.log.mockClear();
});

describe("createCheckout with a backup gateway", () => {
  it("uses Razorpay when it works, and logs nothing", async () => {
    const checkout = await createCheckout(input);
    expect(checkout.orderId).toBe("order_rzp");
    expect(checkout.cashfree).toBeUndefined();
    expect(state.log).not.toHaveBeenCalled();
  });
  it("takes the payment on Cashfree when Razorpay can't create it, and leaves a warning", async () => {
    state.razorpayFails = true;
    const checkout = await createCheckout(input);
    expect(checkout.cashfree?.paymentSessionId).toBe("s");
    expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ level: "warning", source: "payment_gateway" }));
  });
  it("fails with Razorpay's error when failover is off", async () => {
    state.razorpayFails = true;
    state.policy.failover = false;
    await expect(createCheckout(input)).rejects.toThrow("Razorpay is down");
  });
  it("fails with the last error when both are down", async () => {
    state.razorpayFails = true;
    state.cashfreeFails = true;
    await expect(createCheckout(input)).rejects.toThrow("Cashfree is down");
  });
  it("goes straight to Cashfree when it is made primary", async () => {
    state.policy.primary = "cashfree";
    const checkout = await createCheckout(input);
    expect(checkout.cashfree).toBeDefined();
    expect(state.log).not.toHaveBeenCalled();
  });
  it("never tries Cashfree when it has no keys", async () => {
    state.razorpayFails = true;
    state.cashfreeConfigured = false;
    await expect(createCheckout(input)).rejects.toThrow("Razorpay is down");
  });
  it("refuses cleanly when no gateway is set up", async () => {
    state.razorpayConfigured = false;
    state.cashfreeConfigured = false;
    await expect(createCheckout(input)).rejects.toThrow("No payment gateway is configured");
  });
});
