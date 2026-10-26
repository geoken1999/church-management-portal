"use client";

import { useState } from "react";
import { startOnboardingCheckout } from "@/lib/onboarding/tenant-actions";
import { openRazorpaySubscription } from "@/lib/razorpay/browser";
import { showPaymentLoading, hidePaymentLoading } from "@/lib/razorpay/loading";
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

// Shown on Billing once KingdomFlow has set up the church's modules: what is included, the monthly
// total, and the authorization that starts the subscription.
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
  const [open, setOpen] = useState(false);
  const price = withGst(monthlyBase);

  function begin() {
    setOpen(true);
  }

  async function start(details: BillingDetailsInput): Promise<CheckoutResult> {
    showPaymentLoading();
    const result = await startOnboardingCheckout(details);
    if (result.error || !result.checkout) {
      hidePaymentLoading();
      return {
        error: result.error ?? "Couldn't start checkout.",
        billingErrors: result.billingErrors,
      };
    }
    // Closing the dialog leaves Razorpay's payment window over the page; the return route takes it from there.
    setOpen(false);
    try {
      await openRazorpaySubscription(result.checkout);
    } catch {
      return {
        error:
          "Couldn't open the payment window. Check your connection and try again.",
      };
    }
    return {};
  }

  return (
    <Card className="border-primary">
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
