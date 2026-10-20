"use client";

import type {
  RazorpayCheckout,
  RazorpaySubscriptionCheckout,
} from "@/lib/razorpay/checkout";

// Opens Razorpay's checkout in the browser. On success Razorpay sends the browser to checkout.callbackUrl
// with the result (a full navigation, like the redirect the old checkout used), so the page that calls this
// does not stay open: the return route decides where the person lands next.

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
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

/** Opens the checkout. Resolves when it is open; `onDismiss` runs if the person closes it without paying. */
export async function openRazorpayCheckout(
  checkout: RazorpayCheckout,
  onDismiss?: () => void,
): Promise<void> {
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
    callback_url: checkout.callbackUrl,
    redirect: true,
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
    callback_url: checkout.callbackUrl,
    redirect: true,
    theme: { color: "#2d4a7a" },
    modal: { ondismiss: () => onDismiss?.() },
  });
  razorpay.open();
}
