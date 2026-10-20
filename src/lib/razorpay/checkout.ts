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
