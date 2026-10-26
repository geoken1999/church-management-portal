"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createMembershipInvoiceOrder } from "@/lib/membership-fees/actions";
import { openRazorpayCheckout } from "@/lib/razorpay/browser";
import { showPaymentLoading, hidePaymentLoading } from "@/lib/razorpay/loading";
import { Button } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";

// Paying opens Razorpay's payment window; once it succeeds Razorpay sends the browser to
// /api/razorpay/membership/return?token=..., which lands back on this same public page — see page.tsx for how a failed attempt is
// shown (the ?payment=failed query param); a successful one just finds the
// invoice already marked paid on reload, no query param needed for that case.
export function MembershipPayButton({
  token,
  amount,
}: {
  token: string;
  amount: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  async function handlePay() {
    setError(null);
    setSubmitting(true);
    showPaymentLoading();

    const result = await createMembershipInvoiceOrder(token);
    if (result.alreadyPaid) {
      hidePaymentLoading();
      setAlreadyPaid(true);
      setSubmitting(false);
      return;
    }
    if (result.error || !result.checkout) {
      hidePaymentLoading();
      setError(result.error ?? "Couldn't start the payment.");
      setSubmitting(false);
      return;
    }

    try {
      await openRazorpayCheckout(result.checkout, () => setSubmitting(false));
    } catch {
      setError(
        "Couldn't open the payment window. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  if (alreadyPaid) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <p className="font-medium">
          Thank you, your payment has been received.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ErrorToast message={error} />
      <Button
        type="button"
        className="w-full"
        disabled={submitting}
        onClick={handlePay}
      >
        {submitting
          ? "Processing…"
          : `Pay ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </Button>
    </div>
  );
}
