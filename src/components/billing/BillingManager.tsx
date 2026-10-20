"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, CreditCard } from "lucide-react";
import {
  startSubscriptionCheckout,
  cancelSubscription,
  keepSubscription,
} from "@/lib/billing/actions";
import { openRazorpaySubscription } from "@/lib/razorpay/browser";
import { PLANS, priceForInterval, type PlanId } from "@/lib/plans/config";
import {
  PLAN_ORDER,
  planFeatureRows,
  planDescription,
} from "@/lib/plans/display";
import type {
  OrganizationSubscription,
  SubscriptionStatus,
  SubscriptionBillingInterval,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorToast } from "@/components/ui/error-toast";
import {
  BillingDetailsDialog,
  type CheckoutResult,
} from "@/components/billing/BillingDetailsDialog";
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

const INTERVAL_LABELS: Record<SubscriptionBillingInterval, string> = {
  monthly: "Monthly",
  annual: "Annual",
};

const IN_PROGRESS_STATUSES: SubscriptionStatus[] = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
];

export function BillingManager({
  currentPlanId,
  subscription,
  paymentsConfigured,
  billingDetails,
  sellerState,
}: {
  currentPlanId: PlanId;
  subscription: OrganizationSubscription | null;
  paymentsConfigured: boolean;
  billingDetails: BillingDetailsInput;
  sellerState: string;
}) {
  const router = useRouter();
  // The plan being bought: asks for billing details first.
  const [checkoutPlanId, setCheckoutPlanId] = useState<PlanId | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInProgressSubscription = Boolean(
    subscription && IN_PROGRESS_STATUSES.includes(subscription.status),
  );

  // Monthly billing only for new subscriptions (an older annual one, if any, still displays below).
  function handleSubscribe(planId: PlanId) {
    setError(null);
    setCheckoutPlanId(planId);
  }

  // Called by the billing details dialog. On success Razorpay's payment window opens over the page and, once the
  // church has authorised, sends the browser to the return route, so only a problem comes back here.
  async function startCheckout(
    details: BillingDetailsInput,
  ): Promise<CheckoutResult> {
    if (!checkoutPlanId) return { error: "Choose a plan." };
    const result = await startSubscriptionCheckout(checkoutPlanId, details);
    if (result.error || !result.checkout)
      return {
        error: result.error ?? "Couldn't start checkout.",
        billingErrors: result.billingErrors,
      };
    setCheckoutPlanId(null);
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

  const endsOn = subscription?.next_charge_at
    ? new Date(subscription.next_charge_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const cancelPending = Boolean(
    subscription?.cancel_at_period_end && subscription.status === "active",
  );

  async function handleKeep() {
    setError(null);
    setCancelling(true);
    const result = await keepSubscription();
    setCancelling(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    setError(null);
    const live = subscription?.status === "active" && endsOn;
    const question = live
      ? `Cancel your subscription? You keep full access until ${endsOn}, the end of the period you've paid for, and you won't be charged again. There's no refund for the current period.`
      : "Cancel this subscription?";
    if (!window.confirm(question)) return;
    setCancelling(true);
    const result = await cancelSubscription();
    setCancelling(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!paymentsConfigured && (
        <Alert>
          <AlertDescription>
            Billing isn&apos;t configured yet for this app — an admin needs to
            set the Razorpay API keys before subscriptions can be started.
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
              <Badge
                variant={
                  subscription.status === "active" && !cancelPending
                    ? "default"
                    : "secondary"
                }
              >
                {cancelPending
                  ? "Cancelling"
                  : STATUS_LABELS[subscription.status]}
              </Badge>
            </div>
            <CardDescription>
              {subscription.monthly_amount !== null
                ? `Custom modules plan (${subscription.onboarding_modules?.length ?? 0} modules) — ${formatPrice(withGst(Number(subscription.monthly_amount)).total)} a month including GST`
                : `${PLANS[currentPlanId].name} plan — ${INTERVAL_LABELS[subscription.billing_interval]}`}
              {cancelPending && endsOn
                ? ` — ends on ${endsOn}`
                : subscription.next_charge_at &&
                    subscription.status === "active"
                  ? ` — next charge ${new Date(subscription.next_charge_at).toLocaleDateString()}`
                  : subscription.current_end && subscription.status === "active"
                    ? ` — renews ${new Date(subscription.current_end).toLocaleDateString()}`
                    : ""}
            </CardDescription>
          </CardHeader>
          {hasInProgressSubscription && (
            <CardContent className="space-y-3">
              {cancelPending && endsOn && (
                <p className="text-sm text-muted-foreground">
                  You&apos;ve cancelled. You keep full access until{" "}
                  <strong>{endsOn}</strong> and won&apos;t be charged again.
                  After that your organization moves to the Basic plan.
                </p>
              )}
              {cancelPending ? (
                <Button size="sm" onClick={handleKeep} disabled={cancelling}>
                  {cancelling ? "Updating..." : "Keep my subscription"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling..." : "Cancel subscription"}
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const price = priceForInterval(plan, "monthly");
          const isCurrent =
            planId === currentPlanId &&
            subscription?.status === "active" &&
            subscription.billing_interval === "monthly";
          const blockedBySwitch =
            hasInProgressSubscription &&
            !isCurrent &&
            (subscription?.plan_id !== planId ||
              subscription?.billing_interval !== "monthly");

          return (
            <Card
              key={planId}
              className={isCurrent ? "border-primary shadow-lg" : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current plan</Badge>}
                </div>
                <p className="font-heading text-3xl font-bold">{price.label}</p>
                <p className="text-xs text-muted-foreground">
                  + 18% GST: {formatPrice(withGst(plan.priceInRupees).total)} a
                  month in total
                </p>
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
                      <span
                        className={
                          row.included ? "" : "text-muted-foreground/60"
                        }
                      >
                        {row.label}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || blockedBySwitch || !paymentsConfigured}
                  onClick={() => handleSubscribe(planId)}
                >
                  {isCurrent
                    ? "Current plan"
                    : blockedBySwitch
                      ? cancelPending && endsOn
                        ? `Available from ${endsOn}`
                        : "Cancel current plan first"
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
