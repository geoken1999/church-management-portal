import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getOrgAdminEmails } from "@/lib/organizations/admin-emails";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The counterpart to notifyPlatformAdmins (src/lib/platform-admin/
// notify.ts), which already emails the platform admin whenever an org
// creates or replies to a ticket — until now a reply going the other way
// only ever showed up as an in-app bell notification (support_ticket_reply
// in src/lib/notifications/create.ts's insert), easy to miss for anyone
// not actively watching the dashboard. Best-effort, same as every other
// system email here: never allowed to break the reply action it's called
// from.
export async function notifyOrgOfSupportReply(input: { organizationId: string; ticketSubject: string; replyBody: string }): Promise<void> {
  if (!isEmailConfigured()) return;

  const recipients = await getOrgAdminEmails(input.organizationId);
  if (recipients.length === 0) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <p>Support replied to your ticket:</p>
      <p style="margin: 0 0 16px; font-weight: 600;">${escapeHtml(input.ticketSubject)}</p>
      <div style="border-left: 3px solid #7c3aed; padding: 4px 0 4px 12px; color: #333; white-space: pre-wrap;">${escapeHtml(input.replyBody)}</div>
      <p style="margin-top: 24px; color: #999; font-size: 12px;">Reply from your dashboard's Help &amp; Support tab.</p>
    </div>
  `;

  try {
    await sendBulkEmail({ fromName: "KingdomFlow Support", subject: `Re: ${input.ticketSubject}`, html, recipients, organizationId: input.organizationId });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Failed to notify org of support reply: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: input.organizationId,
    });
  }
}
