import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { buildQrPng } from "@/lib/events/registration-pass";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { formatInTimezone } from "@/lib/organizations/timezone";

// Every value here can come from an organizer's own free text (title, org
// name) or a registrant's own input (name) — escaped before going into the
// HTML body, same care as the registration pass email
// (src/lib/events/registration-pass.ts).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A lighter companion to sendRegistrationPassEmail — no .ics attachment
// (the registrant already has it), but it carries the QR code too: on the
// day, this is the email people open at the door, and a reminder with no QR
// in it sent them hunting for the original email. Wording deliberately
// avoids claiming a specific lead time ("in 24 hours") since the sending
// cron (src/app/api/cron/event-reminders) is idempotent per occurrence
// but not exact-to-the-minute — it just states the real date/time.
export async function sendRegistrationReminderEmail(input: {
  organizationId: string;
  organizationName: string;
  organizationTimezone: string;
  to: string;
  recipientName: string | null;
  eventTitle: string;
  startAt: string;
  venueLabel: string | null;
  mapLink: string | null;
  joinLink: string | null;
  confirmationCode: string;
  passColor: string;
  /** The registrant's own pass page, shown as a link under the QR for mail apps that don't display the image inside the email. */
  passUrl?: string | null;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  // The pass QR (with the church's logo when it has one). If it can't be made the reminder still goes, with the code and the link.
  let qrPng: Buffer | null = null;
  try {
    qrPng = await buildQrPng(input.confirmationCode, input.organizationId);
  } catch {
    qrPng = null;
  }

  const startLabel = formatInTimezone(
    input.startAt,
    input.organizationTimezone,
    { dateStyle: "full", timeStyle: "short" },
  );
  const passColor = input.passColor || "#7c3aed";
  const greeting = input.recipientName
    ? `Hi ${escapeHtml(input.recipientName)},`
    : "Hi,";

  // venueLabel and joinLink are independent (a hybrid event has both), so
  // each gets its own row when present, same reasoning as
  // registration-pass.ts's venueHtml/joinHtml split.
  const venueHtml = input.venueLabel
    ? input.mapLink
      ? `<a href="${escapeHtml(input.mapLink)}" style="color: #555; text-decoration: none;">${escapeHtml(input.venueLabel)}</a>`
      : escapeHtml(input.venueLabel)
    : "";
  const joinHtml = input.joinLink
    ? `<a href="${escapeHtml(input.joinLink)}" style="color: #555; text-decoration: none;">Join online</a>`
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <p style="margin: 0 0 4px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #999;">Reminder</p>
        <h1 style="margin: 0 0 12px; font-size: 20px;">${escapeHtml(input.eventTitle)}</h1>
        <p>${greeting} this is a reminder that you're registered for the event below.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 0; color: #666;">When</td><td style="padding: 4px 0; text-align: right;">${startLabel}</td></tr>
          ${venueHtml ? `<tr><td style="padding: 4px 0; color: #666;">Where</td><td style="padding: 4px 0; text-align: right;">${venueHtml}</td></tr>` : ""}
          ${joinHtml ? `<tr><td style="padding: 4px 0; color: #666;">Online</td><td style="padding: 4px 0; text-align: right;">${joinHtml}</td></tr>` : ""}
        </table>
        <p style="margin-bottom: 4px; font-size: 13px; color: #666;">Your confirmation code</p>
        <p style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: ${passColor};">${input.confirmationCode}</p>
        ${qrPng ? `<p style="margin: 16px 0 0;"><img src="cid:registration-pass-qr" width="160" height="160" alt="QR code" style="display: block; border-radius: 8px;" /></p>` : ""}
        ${input.passUrl ? `<p style="margin: 14px 0 0; font-size: 13px; color: #555;">${qrPng ? "QR code not showing? " : ""}<a href="${escapeHtml(input.passUrl)}" style="color: ${passColor}; font-weight: 600;">Open your pass online</a>, or show the confirmation code above at check-in.</p>` : ""}
        <p style="color: #999; font-size: 12px; margin-top: 24px;">Show your QR code or confirmation code at check-in. Your calendar invite is in your original confirmation email.</p>
        <p style="color: #999; font-size: 12px;">— ${escapeHtml(input.organizationName)}, via KingdomFlow</p>
      </div>
    </div>
  `;

  try {
    await sendBulkEmail({
      fromName: input.organizationName,
      subject: `Reminder: ${input.eventTitle}`,
      html,
      recipients: [input.to],
      attachments: qrPng ? [{ filename: "registration-pass-qr.png", content: qrPng, contentType: "image/png", contentId: "registration-pass-qr" }] : undefined,
      organizationId: input.organizationId,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Registration reminder email failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: input.organizationId,
      metadata: { to: input.to },
    });
  }
}
