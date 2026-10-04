"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createEventRegistrationOrder, confirmEventRegistrationPayment } from "@/lib/events/razorpay-registration";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

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

export function EventRegistrationPayment({
  registrationId,
  amount,
}: {
  registrationId: string;
  amount: number;
}) {
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    loadCheckoutScript()
      .then(() => setScriptReady(true))
      .catch(() => setError(t.publicEvent.paymentFormLoadError));
  }, [t.publicEvent.paymentFormLoadError]);

  async function handlePay() {
    setError(null);

    if (!scriptReady || !window.Razorpay) {
      setError(t.publicEvent.paymentFormStillLoading);
      return;
    }

    setSubmitting(true);
    const result = await createEventRegistrationOrder(registrationId);
    if (result.error || !result.orderId || !result.keyId) {
      setError(result.error ?? "Couldn't start the payment.");
      setSubmitting(false);
      return;
    }

    const razorpay = new window.Razorpay({
      key: result.keyId,
      order_id: result.orderId,
      amount: Math.round((result.amount ?? amount) * 100),
      currency: "INR",
      name: result.organizationName,
      description: `Registration for ${result.eventTitle}`,
      theme: { color: "#6C47FF" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const confirmResult = await confirmEventRegistrationPayment(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature,
        );
        setSubmitting(false);
        if (confirmResult.error) {
          setError(confirmResult.error);
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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <div>
            <h3 className="font-heading text-lg font-bold">{t.publicEvent.paymentSuccessTitle}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t.publicEvent.paymentSuccessDescription}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="button" className="w-full" disabled={submitting || !scriptReady} onClick={handlePay}>
          {submitting ? t.publicEvent.processingPayment : t.publicEvent.payNow(amount)}
        </Button>
      </CardContent>
    </Card>
  );
}
