"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, CreditCard } from "lucide-react";
import { startPayUSubscriptionCheckout, cancelPayUSubscription } from "@/lib/billing/payu-subscription-actions";
// Legacy path: still used for any subscription a church started before
// this moved to PayU — see handleCancel below. New checkouts never create
// a razorpay_subscription_id, so this becomes unreachable once no org has
// one left.
import { cancelSubscription as cancelRazorpaySubscription } from "@/lib/billing/actions";
import { redirectToPayU } from "@/lib/payu/browser";
import { PLANS, priceForInterval, type PlanId } from "@/lib/plans/config";
import { PLAN_ORDER, planFeatureRows, planDescription } from "@/lib/plans/display";
import type { OrganizationSubscription, SubscriptionStatus, SubscriptionBillingInterval } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";
import { BillingDetailsDialog, type CheckoutResult } from "@/components/billing/BillingDetailsDialog";
import type { BillingDetailsInput } from "@/lib/billing/billing-details";
import { formatPrice, withGst } from "@/lib/billing/gst";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  created: "Awaiting payment",
  authenticated: "Awaiting first charge",
  active: "Active",
  pending: "Payment retrying",
  halted: "Payment failed",
  cancelled: "Cancelled",
  completed: "Completed",
  expired: "Expired",
};

const INTERVAL_LABELS: Record<SubscriptionBillingInterval, string> = { monthly: "Monthly", annual: "Annual" };

const IN_PROGRESS_STATUSES: SubscriptionStatus[] = ["created", "authenticated", "active", "pending", "halted"];

export function BillingManager({
  currentPlanId,
  subscription,
  payuConfigured,
  billingDetails,
  sellerState,
}: {
  currentPlanId: PlanId;
  subscription: OrganizationSubscription | null;
  payuConfigured: boolean;
  billingDetails: BillingDetailsInput;
  sellerState: string;
}) {
  const router = useRouter();
  const [vpa, setVpa] = useState("");
  // The plan being bought: asks for billing details first.
  const [checkoutPlanId, setCheckoutPlanId] = useState<PlanId | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInProgressSubscription = Boolean(subscription && IN_PROGRESS_STATUSES.includes(subscription.status));

  // PayU subscriptions here are via UPI Autopay, which NPCI caps at
  // ₹15,000 per recurring debit without extra per-charge authentication —
  // Starter/Growth/Pro's monthly prices are all comfortably under that,
  // but two of the three annual prices aren't, and there's no annual-
  // capable mandate method (cards/e-NACH) built yet. Only monthly billing
  // is offered for new subscriptions; an existing annual Razorpay
  // subscription (if any) still just displays as-is below.
  function handleSubscribe(planId: PlanId) {
    setError(null);
    if (!vpa.trim().includes("@")) {
      setError("Enter your UPI ID first (e.g. yourname@bank) — it's needed to set up the Autopay mandate.");
      return;
    }
    setCheckoutPlanId(planId);
  }

  // Called by the billing details dialog. On success the page leaves for PayU, so only a problem comes back.
  async function startCheckout(details: BillingDetailsInput): Promise<CheckoutResult> {
    if (!checkoutPlanId) return { error: "Choose a plan." };
    const result = await startPayUSubscriptionCheckout(checkoutPlanId, vpa, details);
    if (result.error || !result.payuFields || !result.payuActionUrl) return { error: result.error ?? "Couldn't start checkout.", billingErrors: result.billingErrors };
    redirectToPayU(result.payuActionUrl, result.payuFields);
    return {};
  }

  async function handleCancel() {
    setError(null);
    setCancelling(true);
    // A subscription started before this moved to PayU still has
    // razorpay_subscription_id (and no payu_txnid) — route it to the
    // matching cancel action rather than the new one, which wouldn't
    // recognize it.
    const result = subscription?.razorpay_subscription_id ? await cancelRazorpaySubscription() : await cancelPayUSubscription();
    setCancelling(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!payuConfigured && (
        <Alert>
          <AlertDescription>
            Billing isn&apos;t configured yet for this app — an admin needs to set the PayU API keys before
            subscriptions can be started.
          </AlertDescription>
        </Alert>
      )}

      <ErrorToast message={error} />

      {subscription && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CreditCard className="size-4 text-primary" />
                Current subscription
              </CardTitle>
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                {STATUS_LABELS[subscription.status]}
              </Badge>
            </div>
            <CardDescription>
              {subscription.monthly_amount !== null
                ? `Custom modules plan (${subscription.onboarding_modules?.length ?? 0} modules) — ${formatPrice(withGst(Number(subscription.monthly_amount)).total)} a month including GST`
                : `${PLANS[currentPlanId].name} plan — ${INTERVAL_LABELS[subscription.billing_interval]}`}
              {subscription.next_charge_at && subscription.status === "active"
                ? ` — next charge ${new Date(subscription.next_charge_at).toLocaleDateString()}`
                : subscription.current_end && subscription.status === "active"
                  ? ` — renews ${new Date(subscription.current_end).toLocaleDateString()}`
                  : ""}
            </CardDescription>
          </CardHeader>
          {hasInProgressSubscription && (
            <CardContent>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Cancelling..." : "Cancel subscription"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {!hasInProgressSubscription && (
        <div className="mx-auto max-w-sm space-y-2">
          <Label htmlFor="upi-vpa">Your UPI ID</Label>
          <Input id="upi-vpa" placeholder="yourname@bank" value={vpa} onChange={(e) => setVpa(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Used to set up a UPI Autopay mandate — you&apos;ll confirm it in your own UPI app, and nothing is charged
            until that&apos;s approved.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const price = priceForInterval(plan, "monthly");
          const isCurrent =
            planId === currentPlanId && subscription?.status === "active" && subscription.billing_interval === "monthly";
          const blockedBySwitch =
            hasInProgressSubscription && !isCurrent && (subscription?.plan_id !== planId || subscription?.billing_interval !== "monthly");

          return (
            <Card key={planId} className={isCurrent ? "border-primary shadow-lg" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current plan</Badge>}
                </div>
                <p className="font-heading text-3xl font-bold">{price.label}</p>
                <p className="text-xs text-muted-foreground">+ 18% GST: {formatPrice(withGst(plan.priceInRupees).total)} a month in total</p>
                <CardDescription>{planDescription(planId)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-sm">
                  {planFeatureRows(plan).map((row) => (
                    <li key={row.label} className="flex items-start gap-2">
                      {row.included ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={row.included ? "" : "text-muted-foreground/60"}>{row.label}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || blockedBySwitch || !payuConfigured}
                  onClick={() => handleSubscribe(planId)}
                >
                  {isCurrent
                    ? "Current plan"
                    : blockedBySwitch
                      ? "Cancel current plan first"
                      : "Subscribe"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {checkoutPlanId && (
        <BillingDetailsDialog
          open
          onOpenChange={(open) => !open && setCheckoutPlanId(null)}
          title={`Subscribe to ${PLANS[checkoutPlanId].name}`}
          basePrice={PLANS[checkoutPlanId].priceInRupees}
          sellerState={sellerState}
          initial={billingDetails}
          onSubmit={startCheckout}
        />
      )}
    </div>
  );
}
