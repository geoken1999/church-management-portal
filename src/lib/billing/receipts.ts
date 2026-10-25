import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getOrgAdminEmails } from "@/lib/organizations/admin-emails";

// Best-effort — never allowed to break the webhook/action it's called
// from, so failures are logged (not thrown) and a missing/unconfigured
// shared email account just skips silently. This is a transactional/
// system email, not a campaign — it never touches email_campaigns or the
// shared-email plan quota.
export async function sendBillingEmail(
  organizationId: string,
  subject: string,
  bodyHtml: string,
): Promise<void> {
  if (!isEmailConfigured()) return;

  const recipients = await getOrgAdminEmails(organizationId);
  if (recipients.length === 0) return;

  try {
    await sendBulkEmail({
      fromName: "KingdomFlow Billing",
      subject,
      html: bodyHtml,
      recipients,
      organizationId,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Failed to send billing email: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
      metadata: { subject },
    });
  }
}

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function sendSubscriptionActivatedEmail(
  organizationId: string,
  planName: string,
  interval: "monthly" | "annual",
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    `You're now on the ${planName} plan`,
    `<p>Thanks for subscribing to KingdomFlow!</p><p>Your organization is now on the <strong>${planName}</strong> plan, billed ${interval}. You can review or change this anytime from the Billing page.</p>`,
  );
}

export async function sendSubscriptionChargedEmail(
  organizationId: string,
  planName: string,
  amountPaise: number | null,
): Promise<void> {
  const amountLine =
    amountPaise !== null
      ? `<p>Amount charged: <strong>${formatRupees(amountPaise / 100)}</strong></p>`
      : "";
  await sendBillingEmail(
    organizationId,
    `Payment received — ${planName} plan`,
    `<p>We've received your payment for the <strong>${planName}</strong> plan.</p>${amountLine}<p>Thanks for staying with KingdomFlow.</p>`,
  );
}

export async function sendSubscriptionCancelledEmail(
  organizationId: string,
  planName: string,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Your subscription was cancelled",
    `<p>Your <strong>${planName}</strong> plan subscription has been cancelled and your organization has moved to the Basic plan.</p><p>You can resubscribe anytime from the Billing page.</p>`,
  );
}

// RBI's e-mandate rules require notifying the customer 24-36 hours before
// every recurring debit — this is that notice, sent by the
// subscription-billing cron the day before next_charge_at.
export async function sendUpcomingChargeNoticeEmail(
  organizationId: string,
  planName: string,
  amountRupees: number,
  chargeDateLabel: string,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    `Upcoming charge for your ${planName} plan`,
    `<p>Your UPI Autopay mandate for the <strong>${planName}</strong> plan will be charged <strong>${formatRupees(amountRupees)}</strong> on <strong>${chargeDateLabel}</strong>.</p><p>No action is needed unless you want to cancel first, from the Billing page.</p>`,
  );
}

export async function sendSubscriptionPaymentFailedEmail(
  organizationId: string,
  planName: string,
  willRetry: boolean,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    willRetry
      ? `Payment attempt failed — ${planName} plan`
      : `Subscription halted — ${planName} plan`,
    willRetry
      ? `<p>We couldn't collect this cycle's payment for your <strong>${planName}</strong> plan. We'll try again automatically.</p>`
      : `<p>We couldn't collect payment for your <strong>${planName}</strong> plan after several attempts, so the subscription has been halted. Please update your UPI Autopay mandate from the Billing page to continue.</p>`,
  );
}

export async function sendAddonPurchaseEmail(
  organizationId: string,
  packLabel: string,
  amountRupees: number,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Add-on pack purchased",
    `<p>Your purchase of <strong>${packLabel}</strong> for ${formatRupees(amountRupees)} was successful and has been added to your account.</p>`,
  );
}

// The organizer's receipt once a platform-gateway event's payout request
// has actually been wired and recorded (recordEventPayout, src/lib/
// platform-admin/actions.ts) — the counterpart to notifyPlatformAdmins
// (src/lib/platform-admin/notify.ts), which fires when the request is
// first raised.
export async function sendEventPayoutProcessedEmail(
  organizationId: string,
  eventTitle: string,
  amountRupees: number,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    `Payout sent — ${eventTitle}`,
    `<p>A payout of <strong>${formatRupees(amountRupees)}</strong> for <strong>${eventTitle}</strong>'s registration payments has been processed and wired to you.</p>`,
  );
}

export async function sendMembershipPayoutProcessedEmail(
  organizationId: string,
  amountRupees: number,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Membership fee payout sent",
    `<p>A payout of <strong>${formatRupees(amountRupees)}</strong> from membership fee collections has been processed and wired to you.</p>`,
  );
}

export async function sendCoursePayoutProcessedEmail(
  organizationId: string,
  amountRupees: number,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Course fee payout sent",
    `<p>A payout of <strong>${formatRupees(amountRupees)}</strong> from Bible School course fees has been processed and wired to you.</p>`,
  );
}

export async function sendGivingPayoutProcessedEmail(
  organizationId: string,
  amountRupees: number,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Online giving payout sent",
    `<p>A payout of <strong>${formatRupees(amountRupees)}</strong> from online giving (offerings, tithes and donations) has been processed and wired to you.</p>`,
  );
}

// Sent when the platform admin finishes a tenant's onboarding: what was chosen, what it costs, and
// where to authorize the subscription.
export async function sendOnboardingReadyEmail(
  organizationId: string,
  moduleLabels: string[],
  creditLabels: string[],
  totalWithGst: number,
  billingUrl: string,
): Promise<void> {
  const list = [...moduleLabels, ...creditLabels]
    .map((label) => `<li>${label}</li>`)
    .join("");
  await sendBillingEmail(
    organizationId,
    "Your KingdomFlow plan is ready — one step left",
    `<p>Your onboarding with KingdomFlow is complete. Your plan includes:</p><ul>${list}</ul><p>Monthly total including 18% GST: <strong>${formatRupees(totalWithGst)}</strong>.</p><p>To start, open <a href="${billingUrl}">Billing</a> and authorize the UPI Autopay subscription. Your modules switch on as soon as it is confirmed.</p>`,
  );
}

// Sent when a church cancels part-way through a period: what happens and until when.
export async function sendSubscriptionCancellationScheduledEmail(
  organizationId: string,
  planName: string,
  endsOn: string,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Your subscription will end on " + endsOn,
    `<p>We've received your request to cancel the <strong>${planName}</strong> subscription.</p><p>You keep full access until <strong>${endsOn}</strong>, the end of the period you've already paid for. You won't be charged again. After that your organization moves to the Basic plan.</p><p>Changed your mind? You can keep your subscription from the Billing page any time before ${endsOn}.</p>`,
  );
}

// Churches that subscribed while plans were billed through PayU UPI Autopay: that mandate cannot move to
// Razorpay, so they authorise a new subscription there. They keep their plan until the period they paid for ends.
export async function sendReauthorisationReminderEmail(
  organizationId: string,
  planName: string,
  endsOn: string,
  billingUrl: string,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    `Action needed: authorise your ${planName} plan before ${endsOn}`,
    `<p>We have moved subscription billing to Razorpay. Your existing UPI Autopay mandate will not be charged again, so to keep your <strong>${planName}</strong> plan you need to authorise it once on Razorpay.</p><p>Your plan stays fully active until <strong>${endsOn}</strong>, the end of the period you have paid for. Open the <a href="${billingUrl}">Billing page</a>, choose your plan and authorise it before then to carry on without a break.</p>`,
  );
}

export async function sendReauthorisationRequiredEmail(
  organizationId: string,
  planName: string,
  billingUrl: string,
): Promise<void> {
  await sendBillingEmail(
    organizationId,
    `Your ${planName} plan has ended: authorise it on Razorpay to continue`,
    `<p>The period you paid for has ended and your organization is now on the Basic plan, because subscription billing has moved to Razorpay and your old UPI Autopay mandate is no longer used.</p><p>Open the <a href="${billingUrl}">Billing page</a>, choose <strong>${planName}</strong> again and authorise it on Razorpay to get everything back.</p>`,
  );
}
