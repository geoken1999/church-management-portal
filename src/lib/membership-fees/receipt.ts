import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sendMembershipEmail } from "@/lib/membership-fees/email";
import { membershipPeriodLabel } from "@/lib/membership-fees/config";
import { formatInTimezone } from "@/lib/organizations/timezone";

type Admin = ReturnType<typeof createAdminClient>;

// Emails the member a receipt for a paid membership fee. Sent once, from the
// payment confirmation. If that send fails, the daily run retries it.
// Returns true when there's nothing more to send, false when it should be retried.
export async function sendMembershipReceipt(admin: Admin, invoiceId: string): Promise<boolean> {
  const { data: invoice } = await admin
    .from("membership_fee_invoices")
    .select("id, organization_id, member_id, amount, period, paid_at, razorpay_payment_id, receipt_sent_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice?.paid_at || invoice.receipt_sent_at) return true;

  const [{ data: member }, { data: org }] = await Promise.all([
    admin.from("members").select("first_name, email").eq("id", invoice.member_id).maybeSingle(),
    admin.from("organizations").select("name, timezone").eq("id", invoice.organization_id).maybeSingle(),
  ]);
  if (!org) return false;
  if (!member?.email) return true; // nobody to send to; nothing to retry

  const periodLabel = membershipPeriodLabel(invoice.period);
  const amountText = `₹${Number(invoice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const paidOn = formatInTimezone(invoice.paid_at, org.timezone, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  const html = `<p>Dear ${escapeHtml(member.first_name)},</p>
<p>Thank you. We have received your membership fee for <strong>${escapeHtml(periodLabel)}</strong>.</p>
<table style="border-collapse:collapse" cellpadding="6">
<tr><td>Church</td><td><strong>${escapeHtml(org.name)}</strong></td></tr>
<tr><td>Period</td><td>${escapeHtml(periodLabel)}</td></tr>
<tr><td>Amount paid</td><td><strong>${amountText}</strong></td></tr>
<tr><td>Paid on</td><td>${escapeHtml(paidOn)}</td></tr>
<tr><td>Payment reference</td><td>${escapeHtml(invoice.razorpay_payment_id ?? "—")}</td></tr>
</table>
<p>Please keep this email as your receipt.</p>
<p>${escapeHtml(org.name)}</p>`;

  const sent = await sendMembershipEmail({
    organizationId: invoice.organization_id,
    organizationName: org.name,
    to: member.email,
    subject: `Receipt: membership fee for ${periodLabel}`,
    html,
  });
  if (!sent.ok) {
    await logPlatformEvent({
      level: "warning",
      source: "membership_fee",
      message: `Membership receipt not sent: ${sent.error}`,
      organizationId: invoice.organization_id,
      metadata: { invoiceId },
    });
    return false;
  }

  const { error } = await admin
    .from("membership_fee_invoices")
    .update({ receipt_sent_at: new Date().toISOString(), receipt_via: sent.via })
    .eq("id", invoiceId);
  if (error) {
    await logPlatformEvent({
      level: "error",
      source: "membership_fee",
      message: `Membership receipt was sent but couldn't be recorded: ${error.message}`,
      organizationId: invoice.organization_id,
      metadata: { invoiceId },
    });
  }
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
