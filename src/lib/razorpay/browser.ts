"use client";

import type {
  RazorpayCheckout,
  RazorpaySubscriptionCheckout,
} from "@/lib/razorpay/checkout";

// Opens Razorpay's checkout in the browser. On success the result is posted to checkout.callbackUrl from THIS
// tab (a full navigation, so the page that calls this does not stay open): the return route decides where the
// person lands next. The checkout's `handler` is used rather than its `callback_url` + `redirect` mode, because
// that mode can finish in a new tab (UPI, netbanking and wallet pages open in a popup, and the result landed
// there), leaving the original tab behind.

declare global {
  interface Window {
    Cashfree?: (options: { mode: string }) => { checkout: (options: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown> };
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

/** Sends Razorpay's signed result to the return route as a form post, in the tab the person paid from. */
function postResultHere(callbackUrl: string, response: unknown): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = callbackUrl;
  form.target = "_self";
  form.style.display = "none";
  for (const [name, value] of Object.entries((response ?? {}) as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    const onLoad = () =>
      window.Razorpay
        ? resolve()
        : reject(new Error("Couldn't load the payment window."));
    if (existing) {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", () =>
        reject(new Error("Couldn't load the payment window.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = onLoad;
    script.onerror = () =>
      reject(new Error("Couldn't load the payment window."));
    document.body.appendChild(script);
  });
}

const CASHFREE_SCRIPT_SRC = "https://sdk.cashfree.com/js/v3/cashfree.js";

function loadCashfree(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve();
    const fail = () => reject(new Error("Couldn't load the payment window."));
    const existing = document.querySelector(`script[src="${CASHFREE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => (window.Cashfree ? resolve() : fail()));
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.src = CASHFREE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.Cashfree ? resolve() : fail());
    script.onerror = fail;
    document.body.appendChild(script);
  });
}

// The backup gateway. Cashfree's checkout takes over this tab and, once the person has paid (or given up), sends
// the browser back to the same return route Razorpay uses, which asks Cashfree whether the order was paid.
async function openCashfreeCheckout(cashfree: NonNullable<RazorpayCheckout["cashfree"]>): Promise<void> {
  await loadCashfree();
  if (!window.Cashfree) throw new Error("Couldn't load the payment window.");
  await window.Cashfree({ mode: cashfree.mode }).checkout({ paymentSessionId: cashfree.paymentSessionId, redirectTarget: "_self" });
}

/** Opens the checkout. Resolves when it is open; `onDismiss` runs if the person closes it without paying. */
export async function openRazorpayCheckout(
  checkout: RazorpayCheckout,
  onDismiss?: () => void,
): Promise<void> {
  if (checkout.cashfree) return openCashfreeCheckout(checkout.cashfree);
  await loadRazorpay();
  if (!window.Razorpay) throw new Error("Couldn't load the payment window.");
  const razorpay = new window.Razorpay({
    key: checkout.keyId,
    order_id: checkout.orderId,
    amount: checkout.amountPaise,
    currency: checkout.currency,
    name: checkout.name,
    description: checkout.description,
    prefill: checkout.prefill,
    handler: (response: unknown) => postResultHere(checkout.callbackUrl, response),
    theme: { color: "#2d4a7a" },
    modal: { ondismiss: () => onDismiss?.() },
  });
  razorpay.open();
}

/** Opens the checkout that authorises a subscription. Same behaviour as openRazorpayCheckout. */
export async function openRazorpaySubscription(
  checkout: RazorpaySubscriptionCheckout,
  onDismiss?: () => void,
): Promise<void> {
  await loadRazorpay();
  if (!window.Razorpay) throw new Error("Couldn't load the payment window.");
  const razorpay = new window.Razorpay({
    key: checkout.keyId,
    subscription_id: checkout.subscriptionId,
    name: checkout.name,
    description: checkout.description,
    prefill: checkout.prefill,
    handler: (response: unknown) => postResultHere(checkout.callbackUrl, response),
    theme: { color: "#2d4a7a" },
    modal: { ondismiss: () => onDismiss?.() },
  });
  razorpay.open();
}
