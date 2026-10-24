import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendReauthorisationReminderEmail,
  sendReauthorisationRequiredEmail,
} from "@/lib/billing/receipts";
import {
  planNameFor,
  finishScheduledCancellation,
} from "@/lib/billing/cancellation-store";
import { cancellationDue } from "@/lib/billing/cancellation";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";
import { withCronLogging } from "@/lib/cron/run-logger";

// Razorpay now charges every subscription on its own schedule and tells us through the webhook, so nothing is
// collected here any more. What is left is the hand-over of churches that subscribed while plans were billed
// through PayU UPI Autopay (rows with a payu_authpayuid and no Razorpay subscription): that mandate cannot
// move to Razorpay and is never debited again, so each such church
//   - keeps its plan until the end of the period it paid for (next_charge_at),
//   - gets an email REMINDER_DAYS before that date asking it to authorise a Razorpay subscription, and
//   - on that date moves to the Basic plan (status 'cancelled') with a second email, so it can subscribe
//     again from the Billing page whenever it likes.
// A legacy row whose church had already cancelled for the period end is simply closed out on that date.
const REMINDER_DAYS = 7;
const REMINDER_WINDOW_MS = REMINDER_DAYS * 24 * 60 * 60 * 1000;

async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();
  const billingUrl = `${getSiteUrl()}/dashboard/billing`;

  const { data: subscriptions } = await admin
    .from("organization_subscriptions")
    .select(
      "id, organization_id, plan_id, monthly_amount, cancel_at_period_end, status, next_charge_at, predebit_notice_sent_at",
    )
    .in("status", ["active", "halted", "pending"])
    .not("payu_authpayuid", "is", null)
    .is("razorpay_subscription_id", null);

  let reminded = 0;
  let ended = 0;

  for (const sub of subscriptions ?? []) {
    const customAmount =
      sub.monthly_amount !== null && sub.monthly_amount !== undefined
        ? Number(sub.monthly_amount)
        : null;
    const planName = planNameFor(sub.plan_id, customAmount);
    const periodEnd = sub.next_charge_at ? new Date(sub.next_charge_at) : null;

    try {
      // Already stopped (failed payments) or no date to wait for: nothing is paid for any more.
      if (!periodEnd || sub.status !== "active") {
        await endLegacy(admin, sub, customAmount, planName, billingUrl, false);
        ended++;
        continue;
      }

      if (periodEnd.getTime() <= now.getTime()) {
        if (
          cancellationDue(sub.cancel_at_period_end, sub.next_charge_at, now)
        ) {
          await finishScheduledCancellation({
            id: sub.id,
            organization_id: sub.organization_id,
            plan_id: sub.plan_id,
            monthly_amount: customAmount,
          });
          await admin
            .from("organization_subscriptions")
            .update({ payu_authpayuid: null })
            .eq("id", sub.id);
        } else {
          await endLegacy(admin, sub, customAmount, planName, billingUrl, true);
        }
        ended++;
        continue;
      }

      // A church that already cancelled does not need to be asked to authorise anything.
      if (sub.cancel_at_period_end) continue;

      const alreadyReminded =
        sub.predebit_notice_sent_at &&
        new Date(sub.predebit_notice_sent_at) >=
          new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (
        !alreadyReminded &&
        periodEnd.getTime() - now.getTime() <= REMINDER_WINDOW_MS
      ) {
        await sendReauthorisationReminderEmail(
          sub.organization_id,
          planName,
          periodEnd.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          billingUrl,
        );
        await admin
          .from("organization_subscriptions")
          .update({ predebit_notice_sent_at: now.toISOString() })
          .eq("id", sub.id);
        reminded++;
      }
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: `Moving a PayU subscription to Razorpay failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: sub.organization_id,
        metadata: { subscriptionId: sub.id },
      });
    }
  }

  return NextResponse.json({ ok: true, reminded, ended });
}

// The paid period is over (or there never was one): Basic plan, subscription closed, and the church is told
// how to start again on Razorpay.
async function endLegacy(
  admin: ReturnType<typeof createAdminClient>,
  sub: { id: string; organization_id: string },
  customAmount: number | null,
  planName: string,
  billingUrl: string,
  email: boolean,
) {
  await Promise.all([
    admin
      .from("organization_subscriptions")
      .update({
        status: "cancelled",
        next_charge_at: null,
        cancel_at_period_end: false,
        payu_authpayuid: null,
      })
      .eq("id", sub.id),
    admin
      .from("organizations")
      .update(
        customAmount !== null
          ? { plan: "basic", custom_plan_limits: null }
          : { plan: "basic" },
      )
      .eq("id", sub.organization_id),
  ]);
  if (email)
    await sendReauthorisationRequiredEmail(
      sub.organization_id,
      planName,
      billingUrl,
    );
  await logPlatformEvent({
    level: "info",
    source: "subscription_billing",
    message:
      "A PayU-billed subscription ended with its paid period; the church was asked to authorise a Razorpay subscription",
    organizationId: sub.organization_id,
    metadata: { subscriptionId: sub.id },
  });
}

export const GET = withCronLogging("subscription-billing", run);
