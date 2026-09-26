import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Every value here can come from an organizer's own free text (title, org
// name) or a registrant's own input (name) — escaped before going into the
// HTML body, same care as the registration pass email
// (src/lib/events/registration-pass.ts).
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A lighter companion to sendRegistrationPassEmail — no QR code or .ics
// attachment, since the registrant already has both from their original
// pass email; this is purely a "don't forget" nudge. Wording deliberately
// avoids claiming a specific lead time ("in 24 hours") since the sending
// cron (src/app/api/cron/event-reminders) is idempotent per occurrence
// but not exact-to-the-minute — it just states the real date/time.
export async function sendRegistrationReminderEmail(input: {
  organizationId: string;
  organizationName: string;
  to: string;
  recipientName: string | null;
  eventTitle: string;
  startAt: string;
  locationLabel: string;
  mapLink: string | null;
  joinLink: string | null;
  confirmationCode: string;
  passColor: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  const startLabel = new Date(input.startAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
  const passColor = input.passColor || "#7c3aed";
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";

  const pinTarget = input.mapLink || input.joinLink;
  const pinText = input.joinLink ? "Join online" : input.locationLabel;
  const pinIcon = input.joinLink ? "🔗" : "📍";
  const locationHtml = pinTarget
    ? `<a href="${escapeHtml(pinTarget)}" style="color: #555; text-decoration: none;">${pinIcon} ${escapeHtml(pinText)}</a>`
    : `📍 ${escapeHtml(input.locationLabel)}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <p style="margin: 0 0 4px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #999;">Reminder</p>
        <h1 style="margin: 0 0 12px; font-size: 20px;">${escapeHtml(input.eventTitle)}</h1>
        <p>${greeting} this is a reminder that you're registered for the event below.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 0; color: #666;">When</td><td style="padding: 4px 0; text-align: right;">${startLabel}</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Where</td><td style="padding: 4px 0; text-align: right;">${locationHtml}</td></tr>
        </table>
        <p style="margin-bottom: 4px; font-size: 13px; color: #666;">Your confirmation code</p>
        <p style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: ${passColor};">${input.confirmationCode}</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">Your QR code and calendar invite are in your original confirmation email — this is just a reminder.</p>
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
