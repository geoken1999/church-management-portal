"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, CreditCard } from "lucide-react";
import { startSubscriptionCheckout, cancelSubscription } from "@/lib/billing/actions";
import { PLANS, type PlanId } from "@/lib/plans/config";
import { PLAN_ORDER, planFeatureRows, planDescription } from "@/lib/plans/display";
import type { OrganizationSubscription, SubscriptionStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

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

const IN_PROGRESS_STATUSES: SubscriptionStatus[] = ["created", "authenticated", "active", "pending", "halted"];

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

export function BillingManager({
  currentPlanId,
  subscription,
  razorpayConfigured,
  prefill,
}: {
  currentPlanId: PlanId;
  subscription: OrganizationSubscription | null;
  razorpayConfigured: boolean;
  prefill: { name: string; email: string; contact: string };
}) {
  const router = useRouter();
  const [pendingPlanId, setPendingPlanId] = useState<PlanId | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (razorpayConfigured) {
      loadCheckoutScript().catch(() => setError("Couldn't load the Razorpay checkout script."));
    }
  }, [razorpayConfigured]);

  const hasInProgressSubscription = Boolean(subscription && IN_PROGRESS_STATUSES.includes(subscription.status));

  async function handleSubscribe(planId: PlanId) {
    setError(null);
    setPendingPlanId(planId);

    const result = await startSubscriptionCheckout(planId);
    if (result.error || !result.subscriptionId || !result.keyId) {
      setError(result.error ?? "Couldn't start checkout.");
      setPendingPlanId(null);
      return;
    }

    if (!window.Razorpay) {
      setError("Razorpay checkout hasn't finished loading yet — try again in a moment.");
      setPendingPlanId(null);
      return;
    }

    const razorpay = new window.Razorpay({
      key: result.keyId,
      subscription_id: result.subscriptionId,
      name: "KingdomFlow",
      description: `${PLANS[planId].name} plan subscription`,
      prefill: { name: prefill.name, email: prefill.email, contact: prefill.contact },
      theme: { color: "#6C47FF" },
      handler: () => {
        // The webhook is what actually activates the plan server-side —
        // this refresh just picks up whatever state has landed by now.
        router.refresh();
      },
      modal: {
        ondismiss: () => setPendingPlanId(null),
      },
    });
    razorpay.open();
  }

  async function handleCancel() {
    setError(null);
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
      {!razorpayConfigured && (
        <Alert>
          <AlertDescription>
            Billing isn&apos;t configured yet for this app — an admin needs to set the Razorpay API keys before
            subscriptions can be started.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
              {PLANS[currentPlanId].name} plan
              {subscription.current_end && subscription.status === "active"
                ? ` — renews ${new Date(subscription.current_end).toLocaleDateString()}`
                : ""}
            </CardDescription>
          </CardHeader>
          {hasInProgressSubscription && subscription.status !== "created" && (
            <CardContent>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Cancelling..." : "Cancel subscription"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = planId === currentPlanId && subscription?.status === "active";
          const blockedBySwitch = hasInProgressSubscription && subscription?.plan_id !== planId && !isCurrent;

          return (
            <Card key={planId} className={isCurrent ? "border-primary shadow-lg" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current plan</Badge>}
                </div>
                <p className="font-heading text-3xl font-bold">{plan.priceLabel}</p>
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
                  disabled={isCurrent || blockedBySwitch || pendingPlanId === planId || !razorpayConfigured}
                  onClick={() => handleSubscribe(planId)}
                >
                  {isCurrent
                    ? "Current plan"
                    : pendingPlanId === planId
                      ? "Starting checkout..."
                      : blockedBySwitch
                        ? "Cancel current plan first"
                        : "Subscribe"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
