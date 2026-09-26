import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Sent once, right after finalizeGivingOrderPayment successfully records
// the donation — the donor typed their own email into the public /give
// page and is giving to a specific church, so this is styled around that
// church's name (it doesn't have their logo on hand at this point in the
// flow, unlike the pages in src/components/PublicBrandHeader.tsx). A
// best-effort send: a missing donor email or a failed send never undoes
// the already-recorded donation.
export async function sendGivingReceiptEmail(input: {
  organizationId: string;
  organizationName: string;
  fundraiserTitle: string;
  donorEmail: string | null;
  donorName: string;
  amount: number;
  paymentId: string;
  donatedOn: string;
}): Promise<void> {
  if (!input.donorEmail || !isEmailConfigured()) return;

  const dateLabel = new Date(input.donatedOn).toLocaleDateString(undefined, { dateStyle: "long" });

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 16px; font-size: 18px;">Thank you for your gift!</h1>
        <p>Hi ${escapeHtml(input.donorName)},</p>
        <p>Your gift to <strong>${escapeHtml(input.organizationName)}</strong> has been received. Here's your receipt for your records.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 20px 0; font-size: 14px;">
          <tr><td style="padding: 4px 0; color: #666;">Fund</td><td style="padding: 4px 0; text-align: right;">${escapeHtml(input.fundraiserTitle)}</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Amount</td><td style="padding: 4px 0; text-align: right; font-weight: bold;">${formatCurrency(input.amount)}</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Date</td><td style="padding: 4px 0; text-align: right;">${dateLabel}</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Payment reference</td><td style="padding: 4px 0; text-align: right; font-family: monospace; font-size: 12px;">${escapeHtml(input.paymentId)}</td></tr>
        </table>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">— ${escapeHtml(input.organizationName)}, via KingdomFlow</p>
      </div>
    </div>
  `;

  try {
    await sendBulkEmail({
      fromName: input.organizationName,
      subject: `Your receipt from ${input.organizationName}`,
      html,
      recipients: [input.donorEmail],
      organizationId: input.organizationId,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Giving receipt email failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: input.organizationId,
      metadata: { to: input.donorEmail },
    });
  }
}
