"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { startModuleCheckout } from "@/lib/billing/module-actions";
import { openRazorpaySubscription } from "@/lib/razorpay/browser";
import { showPaymentLoading, hidePaymentLoading } from "@/lib/razorpay/loading";
import { formatPrice, withGst } from "@/lib/billing/gst";
import type { BillingDetailsInput } from "@/lib/billing/billing-details";
import { BillingDetailsDialog, type CheckoutResult } from "@/components/billing/BillingDetailsDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// What a locked module's menu item opens: what it is, what it costs on its own, and the authorisation that starts
// its monthly subscription. Everything the church already has stays as it is.
export function UnlockModuleCard({
  moduleKey,
  label,
  planName,
  includes,
  monthlyBase,
  canSubscribe,
  billingDetails,
  sellerState,
  paymentsConfigured,
}: {
  moduleKey: string;
  label: string;
  planName: string;
  includes: string[];
  monthlyBase: number;
  canSubscribe: boolean;
  billingDetails: BillingDetailsInput;
  sellerState: string;
  paymentsConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const price = withGst(monthlyBase);

  async function start(details: BillingDetailsInput): Promise<CheckoutResult> {
    showPaymentLoading();
    const result = await startModuleCheckout(moduleKey, details);
    if (result.error || !result.checkout) {
      hidePaymentLoading();
      return { error: result.error ?? "Couldn't start checkout.", billingErrors: result.billingErrors };
    }
    // Closing the dialog leaves Razorpay's payment window over the page; the return route takes it from there.
    setOpen(false);
    try {
      await openRazorpaySubscription(result.checkout);
    } catch {
      return { error: "Couldn't open the payment window. Check your connection and try again." };
    }
    return {};
  }

  return (
    <Card className="max-w-2xl border-primary/40">
      <CardHeader>
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
          <Lock className="size-5 text-primary" />
        </div>
        <CardTitle className="mt-2 text-xl">Unlock {label.replace(/\s*\(.*\)\s*$/, "")}</CardTitle>
        <CardDescription>
          Your {planName} plan doesn&apos;t include this module. You can add it on its own, without changing your plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {includes.length > 1 && (
          <div>
            <p className="text-sm font-medium">What you get</p>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              {includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <div className="flex justify-between">
            <span>{label.replace(/\s*\(.*\)\s*$/, "")} per month</span>
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
        {canSubscribe ? (
          <>
            <Button onClick={() => setOpen(true)} disabled={!paymentsConfigured}>
              Subscribe for {formatPrice(price.total)} a month
            </Button>
            <p className="text-xs text-muted-foreground">It is a separate monthly subscription. Cancel it any time from Billing: you keep the module until the end of the period you&apos;ve paid for.</p>
          </>
        ) : (
          <p className="rounded-md bg-muted/50 p-3 text-sm">Only your church&apos;s owner or an admin can subscribe. Ask them to unlock {label.replace(/\s*\(.*\)\s*$/, "")} from this menu item.</p>
        )}
      </CardContent>
      {open && (
        <BillingDetailsDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title={`Unlock ${label.replace(/\s*\(.*\)\s*$/, "")}`}
          basePrice={monthlyBase}
          sellerState={sellerState}
          initial={billingDetails}
          onSubmit={start}
        />
      )}
    </Card>
  );
}
