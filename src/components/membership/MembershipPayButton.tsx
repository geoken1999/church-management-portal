"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createMembershipInvoiceOrder, confirmMembershipPayment } from "@/lib/membership-fees/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Couldn't load Razorpay checkout.")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Razorpay checkout."));
    document.body.appendChild(script);
  });
}

export function MembershipPayButton({ token, amount }: { token: string; amount: number }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    loadCheckoutScript()
      .then(() => setScriptReady(true))
      .catch(() => setError("Couldn't load the payment form. Please refresh the page."));
  }, []);

  async function handlePay() {
    setError(null);
    if (!scriptReady || !window.Razorpay) {
      setError("The payment form is still loading. Please try again in a moment.");
      return;
    }

    setSubmitting(true);
    const result = await createMembershipInvoiceOrder(token);
    if (result.alreadyPaid) {
      setSuccess(true);
      setSubmitting(false);
      return;
    }
    if (result.error || !result.orderId || !result.keyId) {
      setError(result.error ?? "Couldn't start the payment.");
      setSubmitting(false);
      return;
    }

    const razorpay = new window.Razorpay({
      key: result.keyId,
      order_id: result.orderId,
      amount: Math.round(amount * 100),
      currency: "INR",
      name: result.organizationName,
      description: `Membership fee, ${result.periodLabel}`,
      theme: { color: "#6C47FF" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const confirmed = await confirmMembershipPayment(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature,
        );
        setSubmitting(false);
        if (confirmed.error) {
          setError(confirmed.error);
          return;
        }
        setSuccess(true);
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
    });
    razorpay.open();
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <p className="font-medium">Thank you, your payment has been received.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" className="w-full" disabled={submitting || !scriptReady} onClick={handlePay}>
        {submitting ? "Processing…" : `Pay ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </Button>
    </div>
  );
}
