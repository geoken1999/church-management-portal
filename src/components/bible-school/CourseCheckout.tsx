"use client";

import { useEffect, useRef } from "react";
import { redirectToPayU } from "@/lib/payu/browser";
import type { PayUFormFields } from "@/lib/payu/client";
import { Button } from "@/components/ui/button";

// Shows what is being paid for and opens PayU's hosted checkout straight away; the button is there in
// case the automatic step is blocked.
export function CourseCheckout({
  title,
  organizationName,
  amount,
  payuFields,
  payuActionUrl,
}: {
  title: string;
  organizationName: string;
  amount: number;
  payuFields: PayUFormFields;
  payuActionUrl: string;
}) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timer = setTimeout(
      () => redirectToPayU(payuActionUrl, payuFields),
      600,
    );
    return () => clearTimeout(timer);
  }, [payuActionUrl, payuFields]);

  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">{organizationName}</p>
      <h1 className="font-heading text-xl font-bold">{title}</h1>
      <p className="text-3xl font-bold">₹{amount.toFixed(2)}</p>
      <p className="text-sm text-muted-foreground">
        Taking you to the secure payment page...
      </p>
      <Button
        type="button"
        className="w-full"
        onClick={() => redirectToPayU(payuActionUrl, payuFields)}
      >
        Pay now
      </Button>
    </div>
  );
}
