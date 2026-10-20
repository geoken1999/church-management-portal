// What the browser needs to open Razorpay's checkout for one payment. Shared by every one-time payment on
// KingdomFlow's own Razorpay account (add-on packs, paid events, membership fees, Bible School programs).
export interface RazorpayCheckout {
  keyId: string;
  orderId: string;
  /** In paise: Razorpay counts money in the smallest unit. */
  amountPaise: number;
  currency: "INR";
  /** Shown at the top of the checkout. */
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  /** Razorpay posts the result here when the payment succeeds; see src/lib/razorpay/platform.ts. */
  callbackUrl: string;
}

export const toPaise = (rupees: number) => Math.round(rupees * 100);

// What the browser needs to open Razorpay's checkout to authorise a subscription (recurring payments).
export interface RazorpaySubscriptionCheckout {
  keyId: string;
  subscriptionId: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  /** Razorpay posts razorpay_payment_id, razorpay_subscription_id and razorpay_signature here. */
  callbackUrl: string;
}
