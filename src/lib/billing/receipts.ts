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
async function sendBillingEmail(organizationId: string, subject: string, bodyHtml: string): Promise<void> {
  if (!isEmailConfigured()) return;

  const recipients = await getOrgAdminEmails(organizationId);
  if (recipients.length === 0) return;

  try {
    await sendBulkEmail({ fromName: "KingdomFlow Billing", subject, html: bodyHtml, recipients, organizationId });
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

export async function sendSubscriptionActivatedEmail(organizationId: string, planName: string, interval: "monthly" | "annual"): Promise<void> {
  await sendBillingEmail(
    organizationId,
    `You're now on the ${planName} plan`,
    `<p>Thanks for subscribing to KingdomFlow!</p><p>Your organization is now on the <strong>${planName}</strong> plan, billed ${interval}. You can review or change this anytime from the Billing page.</p>`,
  );
}

export async function sendSubscriptionChargedEmail(organizationId: string, planName: string, amountPaise: number | null): Promise<void> {
  const amountLine = amountPaise !== null ? `<p>Amount charged: <strong>${formatRupees(amountPaise / 100)}</strong></p>` : "";
  await sendBillingEmail(
    organizationId,
    `Payment received — ${planName} plan`,
    `<p>We've received your payment for the <strong>${planName}</strong> plan.</p>${amountLine}<p>Thanks for staying with KingdomFlow.</p>`,
  );
}

export async function sendSubscriptionCancelledEmail(organizationId: string, planName: string): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Your subscription was cancelled",
    `<p>Your <strong>${planName}</strong> plan subscription has been cancelled and your organization has moved to the Basic plan.</p><p>You can resubscribe anytime from the Billing page.</p>`,
  );
}

export async function sendAddonPurchaseEmail(organizationId: string, packLabel: string, amountRupees: number): Promise<void> {
  await sendBillingEmail(
    organizationId,
    "Add-on pack purchased",
    `<p>Your purchase of <strong>${packLabel}</strong> for ${formatRupees(amountRupees)} was successful and has been added to your account.</p>`,
  );
}
