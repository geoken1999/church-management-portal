import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerRecurringCharge } from "@/lib/billing/payu-subscription";
import { sendSubscriptionChargedEmail, sendSubscriptionPaymentFailedEmail, sendUpcomingChargeNoticeEmail } from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { isPlanId, PLANS } from "@/lib/plans/config";

// Owns the entire recurring side of PayU plan subscriptions — see
// migration 0119 and payu-subscription.ts's file header for why this cron
// exists at all: PayU doesn't auto-charge on schedule the way Razorpay
// Subscriptions did, so this app has to.
//
// Runs once daily (Vercel Hobby's cron limit, same as every other cron in
// this app) at 01:30 UTC = 07:00 IST — inside UPI Autopay's "before 10 AM"
// processing window (NPCI restricts recurring UPI debits to three daily
// windows: before 10am, 1-5pm, after 9:30pm). A charge that fails simply
// stays overdue and gets retried on the NEXT day's run, up to
// MAX_CONSECUTIVE_FAILURES times — a daily cadence rather than NPCI's
// exact "up to 3 retries" timing, which would need sub-daily scheduling
// this plan doesn't have.
//
// NONE of this has been exercised against a live PayU account — see the
// file header on payu-subscription.ts.
const MAX_CONSECUTIVE_FAILURES = 4;

// RBI's e-mandate rules require notice 24-36 hours before every recurring
// debit. A once-a-day cron can't hit that window precisely, so this sends
// the notice on whichever run first finds next_charge_at within 48 hours
// (at most ~1 run-interval early, never late) — predebit_notice_sent_at
// stops it being sent again for the same cycle.
const PREDEBIT_NOTICE_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: subscriptions } = await admin
    .from("organization_subscriptions")
    .select("id, organization_id, plan_id, status, payu_authpayuid, next_charge_at, predebit_notice_sent_at, consecutive_charge_failures")
    .eq("status", "active")
    .not("next_charge_at", "is", null)
    .not("payu_authpayuid", "is", null);

  let noticesSent = 0;
  let charged = 0;
  let failed = 0;
  let halted = 0;

  for (const sub of subscriptions ?? []) {
    const planName = isPlanId(sub.plan_id) ? PLANS[sub.plan_id].name : sub.plan_id;
    const amountRupees = isPlanId(sub.plan_id) ? PLANS[sub.plan_id].priceInRupees : null;
    const nextChargeAt = new Date(sub.next_charge_at as string);

    // Pre-debit notice — checked before the charge itself so a brand-new
    // "due today" subscription still gets a (late, best-effort) notice
    // rather than none at all.
    const noticeAlreadySent = sub.predebit_notice_sent_at && new Date(sub.predebit_notice_sent_at) >= new Date(nextChargeAt.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!noticeAlreadySent && nextChargeAt.getTime() - now.getTime() <= PREDEBIT_NOTICE_WINDOW_MS && amountRupees !== null) {
      await sendUpcomingChargeNoticeEmail(sub.organization_id, planName, amountRupees, nextChargeAt.toLocaleDateString("en-IN"));
      await admin.from("organization_subscriptions").update({ predebit_notice_sent_at: now.toISOString() }).eq("id", sub.id);
      noticesSent++;
    }

    if (nextChargeAt.getTime() > now.getTime() || amountRupees === null) continue;

    const txnid = `subchg${Date.now()}${sub.id.replace(/-/g, "").slice(0, 8)}`;
    let result;
    try {
      result = await triggerRecurringCharge({ authpayuid: sub.payu_authpayuid as string, amountRupees, txnid });
    } catch (err) {
      result = { success: false, status: "error", raw: { error: err instanceof Error ? err.message : "unknown error" } };
    }

    await admin.from("subscription_charges").insert({
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      txnid,
      amount: amountRupees,
      status: result.success ? "charged" : "failed",
      payu_response: result.raw as never,
      charged_at: result.success ? now.toISOString() : null,
    });

    if (result.success) {
      charged++;
      const nextCycle = new Date(nextChargeAt);
      nextCycle.setMonth(nextCycle.getMonth() + 1);
      await admin
        .from("organization_subscriptions")
        .update({ next_charge_at: nextCycle.toISOString(), consecutive_charge_failures: 0, current_start: now.toISOString() })
        .eq("id", sub.id);
      await sendSubscriptionChargedEmail(sub.organization_id, planName, Math.round(amountRupees * 100));
      continue;
    }

    failed++;
    const failures = (sub.consecutive_charge_failures ?? 0) + 1;
    await logPlatformEvent({
      level: "warning",
      source: "subscription_billing",
      message: `PayU recurring charge failed (attempt ${failures}/${MAX_CONSECUTIVE_FAILURES}): ${result.status}`,
      organizationId: sub.organization_id,
      metadata: { txnid, subscriptionId: sub.id },
    });

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      halted++;
      await admin.from("organization_subscriptions").update({ status: "halted", consecutive_charge_failures: failures }).eq("id", sub.id);
      await admin.from("organizations").update({ plan: "basic" }).eq("id", sub.organization_id);
      await sendSubscriptionPaymentFailedEmail(sub.organization_id, planName, false);
    } else {
      await admin.from("organization_subscriptions").update({ consecutive_charge_failures: failures }).eq("id", sub.id);
      await sendSubscriptionPaymentFailedEmail(sub.organization_id, planName, true);
    }
  }

  return NextResponse.json({ ok: true, noticesSent, charged, failed, halted });
}
