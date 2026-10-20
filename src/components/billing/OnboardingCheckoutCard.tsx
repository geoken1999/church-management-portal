"use client";

import { useState } from "react";
import { startOnboardingCheckout } from "@/lib/onboarding/tenant-actions";
import { redirectToPayU } from "@/lib/payu/browser";
import { formatPrice, withGst } from "@/lib/billing/gst";
import type { BillingDetailsInput } from "@/lib/billing/billing-details";
import {
  BillingDetailsDialog,
  type CheckoutResult,
} from "@/components/billing/BillingDetailsDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";

// Shown on Billing once KingdomFlow has set up the church's modules: what is included, the monthly
// total, and the UPI Autopay authorization that starts the subscription.
export function OnboardingCheckoutCard({
  moduleLabels,
  creditLabels,
  monthlyBase,
  billingDetails,
  sellerState,
  paymentsConfigured,
}: {
  moduleLabels: string[];
  creditLabels: string[];
  monthlyBase: number;
  billingDetails: BillingDetailsInput;
  sellerState: string;
  paymentsConfigured: boolean;
}) {
  const [vpa, setVpa] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = withGst(monthlyBase);

  function begin() {
    setError(null);
    if (!vpa.trim().includes("@")) {
      setError("Enter your UPI ID first (e.g. yourname@bank).");
      return;
    }
    setOpen(true);
  }

  async function start(details: BillingDetailsInput): Promise<CheckoutResult> {
    const result = await startOnboardingCheckout(vpa, details);
    if (result.error || !result.payuFields || !result.payuActionUrl)
      return {
        error: result.error ?? "Couldn't start checkout.",
        billingErrors: result.billingErrors,
      };
    redirectToPayU(result.payuActionUrl, result.payuFields);
    return {};
  }

  return (
    <Card className="border-primary">
      <ErrorToast message={error} />
      <CardHeader>
        <CardTitle>Your KingdomFlow plan is ready</CardTitle>
        <CardDescription>
          Your onboarding is complete. Authorize the monthly subscription below
          and your modules switch on right away.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="list-inside list-disc text-sm">
          {[...moduleLabels, ...creditLabels].map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <div className="flex justify-between">
            <span>Modules and credits per month</span>
            <span>{formatPrice(price.base)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>GST 18%</span>
            <span>{formatPrice(price.gst)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
            <span>Charged monthly</span>
            <span>{formatPrice(price.total)}</span>
          </div>
        </div>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="onboarding-upi">Your UPI ID</Label>
          <Input
            id="onboarding-upi"
            placeholder="yourname@bank"
            value={vpa}
            onChange={(e) => setVpa(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Used to set up a UPI Autopay mandate. You confirm it in your own UPI
            app; nothing is charged until you approve it.
          </p>
        </div>
        <Button onClick={begin} disabled={!paymentsConfigured}>
          Authorize subscription
        </Button>
      </CardContent>
      {open && (
        <BillingDetailsDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title="Start your KingdomFlow subscription"
          basePrice={monthlyBase}
          sellerState={sellerState}
          initial={billingDetails}
          onSubmit={start}
        />
      )}
    </Card>
  );
}
