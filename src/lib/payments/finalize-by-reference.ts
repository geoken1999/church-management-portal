import "server-only";

import { finalizeAddonOrderPayment } from "@/lib/billing/addon-actions";
import { finalizeEventRegistrationPayment } from "@/lib/events/registration-payment";
import { finalizeMembershipPayment } from "@/lib/membership-fees/finalize";
import { finalizeProgramPayment } from "@/lib/lms/payments";
import { finalizePayUGivingOrderPayment } from "@/lib/finance/payu-giving";

// The reference each flow puts on its order (Razorpay's receipt, Cashfree's order id) starts with the flow's own
// prefix. Returns an error message, or null when done. The finalizers are idempotent, so a payment the browser's
// return route already handled is a no-op here. Used by both gateways' webhooks, the safety net for a person who
// paid and closed the page before it returned.
export async function finalizeByReference(reference: string, paymentId: string): Promise<string | null> {
  const run = async (fn: () => Promise<{ error?: string }>) => (await fn()).error ?? null;
  if (reference.startsWith("addon")) return run(() => finalizeAddonOrderPayment(reference, paymentId));
  if (reference.startsWith("evreg")) return run(() => finalizeEventRegistrationPayment(reference, paymentId));
  if (reference.startsWith("mship")) return run(() => finalizeMembershipPayment(reference, paymentId));
  if (reference.startsWith("lms")) return run(() => finalizeProgramPayment(reference, paymentId));
  if (reference.startsWith("giving")) return run(() => finalizePayUGivingOrderPayment(reference, paymentId));
  return null;
}
