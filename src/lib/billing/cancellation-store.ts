import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sendSubscriptionCancelledEmail } from "@/lib/billing/receipts";
import { isPlanId, PLANS } from "@/lib/plans/config";

export function planNameFor(
  planId: string,
  monthlyAmount: number | null,
): string {
  return monthlyAmount !== null
    ? "KingdomFlow modules"
    : isPlanId(planId)
      ? PLANS[planId].name
      : planId;
}

// Ends a subscription whose cancellation was waiting for the end of its paid period: no more
// charges, back to the free floor plan. A subscription that came from an onboarding also loses the
// custom modules and allowances it was switched on with, so a later plan starts from a clean slate.
export async function finishScheduledCancellation(subscription: {
  id: string;
  organization_id: string;
  plan_id: string;
  monthly_amount: number | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("organization_subscriptions")
    .update({
      status: "cancelled",
      next_charge_at: null,
      cancel_at_period_end: false,
    })
    .eq("id", subscription.id);
  await admin
    .from("organizations")
    .update(
      subscription.monthly_amount !== null
        ? { plan: "basic", custom_plan_limits: null }
        : { plan: "basic" },
    )
    .eq("id", subscription.organization_id);
  await sendSubscriptionCancelledEmail(
    subscription.organization_id,
    planNameFor(subscription.plan_id, subscription.monthly_amount),
  );
  await logPlatformEvent({
    level: "info",
    source: "subscription_billing",
    message:
      "Subscription ended at the close of its paid period after the church cancelled it",
    organizationId: subscription.organization_id,
    metadata: { subscriptionId: subscription.id },
  });
}
