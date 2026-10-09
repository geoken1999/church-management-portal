"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createMembershipInvoiceOrder } from "@/lib/membership-fees/actions";
import { redirectToPayU } from "@/lib/payu/browser";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Paying means the whole page navigates away to PayU's hosted checkout, then
// PayU redirects back to /api/payu/membership/return?token=..., which lands
// back on this same public page — see page.tsx for how a failed attempt is
// shown (the ?payment=failed query param); a successful one just finds the
// invoice already marked paid on reload, no query param needed for that case.
export function MembershipPayButton({ token, amount }: { token: string; amount: number }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  async function handlePay() {
    setError(null);
    setSubmitting(true);

    const result = await createMembershipInvoiceOrder(token);
    if (result.alreadyPaid) {
      setAlreadyPaid(true);
      setSubmitting(false);
      return;
    }
    if (result.error || !result.payuFields || !result.payuActionUrl) {
      setError(result.error ?? "Couldn't start the payment.");
      setSubmitting(false);
      return;
    }

    redirectToPayU(result.payuActionUrl, result.payuFields);
  }

  if (alreadyPaid) {
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
      <Button type="button" className="w-full" disabled={submitting} onClick={handlePay}>
        {submitting ? "Processing…" : `Pay ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </Button>
    </div>
  );
}
