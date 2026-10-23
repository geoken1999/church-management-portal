import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform-events/log", () => ({ logPlatformEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/receipts", () => ({
  sendSubscriptionChargedEmail: vi.fn(),
  sendSubscriptionPaymentFailedEmail: vi.fn(),
}));
vi.mock("@/lib/billing/razorpay-subscription", () => ({
  activateRazorpaySubscription: vi.fn(),
  recordSubscriptionCharge: vi.fn(async () => true),
}));
vi.mock("@/lib/billing/cancellation-store", () => ({ finishScheduledCancellation: vi.fn(), planNameFor: () => "Starter" }));
vi.mock("@/lib/billing/addon-actions", () => ({ finalizeAddonOrderPayment: vi.fn(async () => ({})) }));
vi.mock("@/lib/events/registration-payment", () => ({ finalizeEventRegistrationPayment: vi.fn(async () => ({})) }));
vi.mock("@/lib/membership-fees/finalize", () => ({ finalizeMembershipPayment: vi.fn(async () => ({})) }));
vi.mock("@/lib/lms/payments", () => ({ finalizeProgramPayment: vi.fn(async () => ({})) }));
vi.mock("@/lib/finance/payu-giving", () => ({ finalizePayUGivingOrderPayment: vi.fn(async () => ({})) }));

// No subscription of ours matches the id in the test events.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        update: () => api,
        maybeSingle: async () => ({ data: null }),
      };
      return api;
    },
  }),
}));

const SECRET = "test-webhook-secret";
const sign = (body: string, secret = SECRET) => crypto.createHmac("sha256", secret).update(body).digest("hex");
const post = async (body: string, signature: string | null) => {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/razorpay/webhook", { method: "POST", body, headers: signature ? { "x-razorpay-signature": signature } : {} }));
};

describe("Razorpay webhook", () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });

  it("refuses a request without a signature", async () => {
    const res = await post("{}", null);
    expect(res.status).toBe(400);
  });

  it("refuses a signature made with another secret", async () => {
    const body = JSON.stringify({ event: "subscription.charged" });
    const res = await post(body, sign(body, "someone-elses-secret"));
    expect(res.status).toBe(400);
  });

  it("says the webhook isn't configured when the secret is missing", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = "{}";
    const res = await post(body, sign(body));
    expect(res.status).toBe(500);
  });

  it("accepts a correctly signed event it doesn't act on", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts a signed subscription event for a subscription that isn't ours", async () => {
    const body = JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: { id: "sub_unknown", status: "active" } }, payment: { entity: { id: "pay_2", amount: 176882 } } } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it("finishes a paid add-on order from order.paid", async () => {
    const { finalizeAddonOrderPayment } = await import("@/lib/billing/addon-actions");
    const body = JSON.stringify({ event: "order.paid", payload: { order: { entity: { receipt: "addon-123" } }, payment: { entity: { id: "pay_3" } } } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(finalizeAddonOrderPayment).toHaveBeenCalledWith("addon-123", "pay_3");
  });
});
