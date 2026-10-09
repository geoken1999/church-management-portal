"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { createEventRegistrationOrder } from "@/lib/events/payu-registration";
import { deferEventRegistrationToCheckin } from "@/lib/events/public-registration-actions";
import { redirectToPayU } from "@/lib/payu/browser";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export function EventRegistrationPayment({
  registrationId,
  amount,
  allowDeferToCheckin = false,
}: {
  registrationId: string;
  amount: number;
  allowDeferToCheckin?: boolean;
}) {
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deferring, startDeferring] = useTransition();
  const [deferred, setDeferred] = useState(false);

  function handleDeferToCheckin() {
    setError(null);
    startDeferring(async () => {
      const result = await deferEventRegistrationToCheckin(registrationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeferred(true);
    });
  }

  // Paying means the whole page navigates away to PayU's hosted checkout,
  // then PayU redirects back to /api/payu/event-registration/return — see
  // PublicEventRegistrationForm for how that return is shown (the
  // ?payment= query param), since this component won't still be mounted
  // by then.
  async function handlePay() {
    setError(null);
    setSubmitting(true);

    const result = await createEventRegistrationOrder(registrationId);
    if (result.error || !result.payuFields || !result.payuActionUrl) {
      setError(result.error ?? "Couldn't start the payment.");
      setSubmitting(false);
      return;
    }

    redirectToPayU(result.payuActionUrl, result.payuFields);
  }

  if (deferred) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <div>
            <h3 className="font-heading text-lg font-bold">{t.publicEvent.deferredToCheckinTitle}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t.publicEvent.deferredToCheckinDescription(amount)}</p>
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
        <Button type="button" className="w-full" disabled={submitting} onClick={handlePay}>
          {submitting ? t.publicEvent.processingPayment : t.publicEvent.payNow(amount)}
        </Button>
        {allowDeferToCheckin && (
          <Button type="button" variant="ghost" className="w-full" disabled={submitting || deferring} onClick={handleDeferToCheckin}>
            {deferring ? t.publicEvent.deferringToCheckin : t.publicEvent.payAtCheckinInstead}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
