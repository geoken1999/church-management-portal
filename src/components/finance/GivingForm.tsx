"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createGivingOrder, confirmGivingPayment } from "@/lib/finance/giving-actions";
import { redirectToPayU } from "@/lib/payu/browser";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

// Razorpay checkout.js is only still needed for 'own'-mode fundraisers (a
// church's own gateway keys) — 'shared' mode (the platform's own account)
// moved to PayU's full-page redirect, which needs no SDK script at all. So
// unlike before, this is loaded lazily on submit rather than eagerly on
// mount, since most givers (shared mode) never need it.
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

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

export function GivingForm({ shareToken, organizationName }: { shareToken: string; organizationName: string }) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [givingSuccess, setGivingSuccess] = useState(false);

  // A PayU redirect-back is a full navigation — the success/failure outcome
  // arrives as a query param, not React state (there's no persisted
  // "already paid" row to re-check on reload the way membership fees have,
  // since a giving link is reusable for any number of separate gifts).
  const paymentResult = searchParams.get("payment");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await createGivingOrder(shareToken, amount, donorName, donorEmail, donorPhone);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.gateway === "payu") {
      if (!result.payuFields || !result.payuActionUrl) {
        setError("Couldn't start the payment.");
        setSubmitting(false);
        return;
      }
      redirectToPayU(result.payuActionUrl, result.payuFields);
      return;
    }

    if (!result.orderId || !result.keyId) {
      setError("Couldn't start the payment.");
      setSubmitting(false);
      return;
    }

    try {
      await loadCheckoutScript();
    } catch {
      setError(t.publicGive.paymentFormLoadError);
      setSubmitting(false);
      return;
    }
    if (!window.Razorpay) {
      setError(t.publicGive.paymentFormStillLoading);
      setSubmitting(false);
      return;
    }

    const razorpay = new window.Razorpay({
      key: result.keyId,
      order_id: result.orderId,
      amount: Math.round((result.amount ?? 0) * 100),
      currency: "INR",
      name: result.organizationName || organizationName,
      description: `Gift to ${result.fundraiserTitle}`,
      prefill: { name: donorName, email: donorEmail || undefined, contact: donorPhone || undefined },
      theme: { color: "#6C47FF" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const confirmResult = await confirmGivingPayment(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature,
        );
        setSubmitting(false);
        if (confirmResult.error) {
          setError(confirmResult.error);
          return;
        }
        setGivingSuccess(true);
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
    });
    razorpay.open();
  }

  if (paymentResult === "success" || givingSuccess) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <div>
            <h3 className="font-heading text-lg font-bold">{t.publicGive.successTitle}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t.publicGive.successDescription(organizationName)}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(error || paymentResult === "failed") && (
            <Alert variant="destructive">
              <AlertDescription>
                {error ?? `${t.publicGive.paymentFailedTitle} ${t.publicGive.paymentFailedDescription}`}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">{t.publicGive.amountLabel}</Label>
            <Input
              id="amount"
              type="number"
              min={1}
              step="1"
              placeholder={t.publicGive.amountPlaceholder}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((quick) => (
                <Button key={quick} type="button" size="sm" variant="outline" onClick={() => setAmount(String(quick))}>
                  ₹{quick.toLocaleString("en-IN")}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="donorName">{t.publicGive.yourName}</Label>
            <Input id="donorName" value={donorName} onChange={(event) => setDonorName(event.target.value)} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="donorEmail">{t.publicGive.emailOptional}</Label>
              <Input id="donorEmail" type="email" value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="donorPhone">{t.publicGive.phoneOptional}</Label>
              <Input id="donorPhone" type="tel" value={donorPhone} onChange={(event) => setDonorPhone(event.target.value)} />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t.publicGive.processing : t.publicGive.give(amount || "0")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
