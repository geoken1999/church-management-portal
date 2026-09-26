import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Sent once, right after createOrganization succeeds — this is KingdomFlow
// welcoming a new customer, not a church-branded page, so it uses the
// app's own identity throughout rather than PublicBrandHeader (which is
// for pages a church's own visitors see).
export async function sendWelcomeEmail(input: { organizationId: string; organizationName: string; recipientEmail: string; recipientFirstName: string | null }): Promise<void> {
  if (!isEmailConfigured()) return;

  const greeting = input.recipientFirstName ? `Hi ${escapeHtml(input.recipientFirstName)},` : "Hi,";
  const dashboardUrl = `${getSiteUrl()}/dashboard`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="background: #7c3aed; color: #fff; padding: 24px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">Welcome to KingdomFlow</h1>
      </div>
      <div style="border: 1px solid #eee; border-top: none; border-radius: 0 0 16px 16px; padding: 24px;">
        <p>${greeting}</p>
        <p><strong>${escapeHtml(input.organizationName)}</strong> is all set up, with a 14-day free trial already running — no card needed.</p>
        <p style="margin-bottom: 4px; font-weight: 600;">A few things to try first:</p>
        <ul style="margin: 0 0 20px; padding-left: 20px; color: #444;">
          <li>Bring in your congregation — bulk-import from Excel, or share your public join link.</li>
          <li>Invite your team from the Team page, with scoped Read/Write/Delete access per tab.</li>
          <li>Add your church logo under Profile — it shows up on every public page you share.</li>
        </ul>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Go to your dashboard
          </a>
        </div>
        <p style="color: #999; font-size: 12px;">Questions any time — just raise a ticket from Help &amp; Support inside the app.</p>
      </div>
    </div>
  `;

  try {
    await sendBulkEmail({
      fromName: "KingdomFlow",
      subject: `Welcome to KingdomFlow, ${input.organizationName}!`,
      html,
      recipients: [input.recipientEmail],
      organizationId: input.organizationId,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Welcome email failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: input.organizationId,
      metadata: { to: input.recipientEmail },
    });
  }
}
