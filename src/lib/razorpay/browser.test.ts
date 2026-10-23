import { afterEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for the browser: enough of document/window to see what the checkout does with a result.
function fakeBrowser() {
  const submitted: { action: string; method: string; target: string; fields: Record<string, string> }[] = [];
  const opened: Record<string, unknown>[] = [];
  const makeEl = (tag: string) => {
    const el: Record<string, unknown> & { children: Record<string, unknown>[] } = {
      tag,
      children: [],
      style: {},
      appendChild(child: Record<string, unknown>) {
        el.children.push(child);
      },
      submit() {
        submitted.push({
          action: String(el.action),
          method: String(el.method),
          target: String(el.target),
          fields: Object.fromEntries(el.children.map((c) => [String(c.name), String(c.value)])),
        });
      },
    };
    return el;
  };
  const win = {
    Razorpay: class {
      constructor(options: Record<string, unknown>) {
        opened.push(options);
      }
      open() {}
      on() {}
    },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    createElement: makeEl,
    body: { appendChild() {} },
    querySelector: () => null,
  });
  return { submitted, opened };
}

afterEach(() => vi.unstubAllGlobals());

describe("Razorpay checkout", () => {
  it("posts the signed result to the return route from the same tab, not a redirect", async () => {
    const { submitted, opened } = fakeBrowser();
    const { openRazorpaySubscription } = await import("./browser");
    await openRazorpaySubscription({
      keyId: "rzp_test_x",
      subscriptionId: "sub_1",
      name: "KingdomFlow",
      description: "Starter",
      prefill: {},
      callbackUrl: "https://www.kingdomflow.in/api/razorpay/subscription/return?organizationId=org1",
    } as never);

    const options = opened[0];
    expect(options.callback_url).toBeUndefined();
    expect(options.redirect).toBeUndefined();
    (options.handler as (r: unknown) => void)({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_1",
      razorpay_signature: "sig",
      ignored: 5,
    });
    expect(submitted).toEqual([
      {
        action: "https://www.kingdomflow.in/api/razorpay/subscription/return?organizationId=org1",
        method: "POST",
        target: "_self",
        fields: { razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "sig" },
      },
    ]);
  });

  it("does the same for one-time payments", async () => {
    const { submitted, opened } = fakeBrowser();
    const { openRazorpayCheckout } = await import("./browser");
    await openRazorpayCheckout({
      keyId: "rzp_test_x",
      orderId: "order_1",
      amountPaise: 47082,
      currency: "INR",
      name: "KingdomFlow",
      description: "Add-on",
      prefill: {},
      callbackUrl: "https://www.kingdomflow.in/api/razorpay/addon/return?orderId=1",
    } as never);
    (opened[0].handler as (r: unknown) => void)({ razorpay_payment_id: "pay_2", razorpay_order_id: "order_1", razorpay_signature: "sig2" });
    expect(submitted[0].target).toBe("_self");
    expect(submitted[0].fields.razorpay_order_id).toBe("order_1");
  });
});
