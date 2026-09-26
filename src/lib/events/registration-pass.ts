import "server-only";

import QRCode from "qrcode";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { buildEventRegistrationIcs } from "@/lib/events/registration-ics";

// Every value below can come from an organizer's own free text (title,
// pass message, org name) or a registrant's own input (name) — escaped
// before going into the HTML body so none of it can break the markup or
// inject something unexpected, same care as any other user content this
// app renders.
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Darkens a "#rrggbb" hex color by a 0-1 fraction — used for the fallback
// banner gradient (passColor -> a darker shade of itself) when an organizer
// hasn't uploaded a background image. Falls back to the color unchanged if
// it's not a plain 6-digit hex (shouldn't happen — validateRegistrationSettings
// already enforces the format — but a broken gradient stop is a worse
// failure mode than a flat one).
function darken(hex: string, amount: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const num = parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(0, Math.round(((num >> shift) & 0xff) * (1 - amount)));
  return `#${[channel(16), channel(8), channel(0)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// The registration pass — a ticket-styled confirmation email with a QR code
// (encoding the confirmation code itself, so any generic QR reader works,
// not just a purpose-built scanner this app doesn't have) and a calendar
// (.ics) invite. Both are real attachments (so they can be saved/opened
// outside the email too, rather than relying on an embedded data-URI image
// some clients strip) — the QR's attachment additionally carries a
// Content-ID so it can also render inline in the ticket body via `cid:`.
// Door staff can also just read the code off the pass and type it in, which
// is why it's rendered as large text too, not only as a QR.
export async function sendRegistrationPassEmail(input: {
  organizationId: string;
  organizationName: string;
  to: string;
  recipientName: string | null;
  eventId: string;
  eventTitle: string;
  eventDescription: string | null;
  startAt: string;
  endAt: string | null;
  locationLabel: string;
  mapLink: string | null;
  joinLink: string | null;
  contactName: string | null;
  contactPhone: string | null;
  confirmationCode: string;
  passColor: string;
  passMessage: string | null;
  backgroundUrl: string | null;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  let qrPng: Buffer;
  try {
    qrPng = await QRCode.toBuffer(input.confirmationCode, { width: 400, margin: 2 });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Registration pass QR generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: input.organizationId,
    });
    return;
  }

  const ics = buildEventRegistrationIcs({
    eventId: input.eventId,
    title: input.eventTitle,
    description: input.eventDescription,
    startAt: input.startAt,
    endAt: input.endAt,
    location: input.locationLabel,
  });

  const startLabel = new Date(input.startAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
  const passColor = input.passColor || "#7c3aed";
  const registeredTo = input.recipientName ? escapeHtml(input.recipientName) : escapeHtml(input.to);

  // A real photo/banner is already a public Storage URL, so it's referenced
  // directly rather than pulled in as another attachment — only the
  // organizer-supplied color needs a fallback since not every event will
  // have a background uploaded.
  const banner = input.backgroundUrl
    ? `<img src="${escapeHtml(input.backgroundUrl)}" width="480" alt="" style="display: block; width: 100%; height: 140px; object-fit: cover;" />`
    : `<div style="height: 100px; background: linear-gradient(135deg, ${passColor}, ${darken(passColor, 0.35)});"></div>`;

  // A location/join "icon" here is a plain emoji rather than an inline SVG
  // or another image attachment — SVG is stripped by several major mail
  // clients (Gmail among them) and a data-URI image is unreliable in
  // Outlook's desktop renderer, while an emoji glyph renders consistently
  // everywhere and needs no attachment at all. Exactly one of mapLink/
  // joinLink is ever set (an event is either offline with a venue/map, or
  // online with a meeting link — see public-registration-actions.ts), so
  // whichever is present becomes the tappable target; "Join online" is
  // shown instead of the raw meeting URL since that's already the link
  // target, not something that needs repeating as visible text.
  const pinTarget = input.mapLink || input.joinLink;
  const pinText = input.joinLink ? "Join online" : input.locationLabel;
  const pinIcon = input.joinLink ? "🔗" : "📍";
  const locationHtml = pinTarget
    ? `<a href="${escapeHtml(pinTarget)}" style="color: #555; text-decoration: none;">${pinIcon} ${escapeHtml(pinText)}</a>`
    : `📍 ${escapeHtml(input.locationLabel)}`;

  const contactParts: string[] = [];
  if (input.contactName) contactParts.push(escapeHtml(input.contactName));
  if (input.contactPhone) contactParts.push(`<a href="tel:${escapeHtml(input.contactPhone)}" style="color: #777;">${escapeHtml(input.contactPhone)}</a>`);
  const contactHtml =
    contactParts.length > 0
      ? `<p style="margin: 8px 0 0; font-size: 13px; color: #777;">Contact: ${contactParts.join(" &middot; ")}</p>`
      : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="border: 1px solid #eee; border-radius: 16px; overflow: hidden;">
        ${banner}
        <div style="padding: 20px 24px 16px; background: #fff;">
          <p style="margin: 0 0 4px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #999;">${escapeHtml(input.organizationName)}</p>
          <h1 style="margin: 0 0 10px; font-size: 20px; line-height: 1.3;">${escapeHtml(input.eventTitle)}</h1>
          <p style="margin: 0; font-size: 14px; color: #555;">${startLabel}</p>
          <p style="margin: 2px 0 0; font-size: 14px; color: #555;">${locationHtml}</p>
          ${contactHtml}
        </div>

        <div style="position: relative; margin: 0 24px; border-top: 2px dashed #e2e2e2;">
          <span style="position: absolute; left: -34px; top: -11px; width: 20px; height: 20px; border-radius: 50%; background: #f4f4f5;"></span>
          <span style="position: absolute; right: -34px; top: -11px; width: 20px; height: 20px; border-radius: 50%; background: #f4f4f5;"></span>
        </div>

        <div style="padding: 18px 24px; background: #fff;">
          <p style="margin: 0 0 2px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #999;">Registered to</p>
          <p style="margin: 0 0 14px; font-size: 16px; font-weight: 600;">${registeredTo}</p>
          ${input.passMessage ? `<p style="margin: 0 0 16px; font-size: 14px; color: #555;">${escapeHtml(input.passMessage)}</p>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td style="vertical-align: middle;">
                <p style="margin: 0 0 2px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #999;">Confirmation code</p>
                <p style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 2px; color: ${passColor};">${input.confirmationCode}</p>
              </td>
              <td style="width: 96px; text-align: right; vertical-align: middle;">
                <img src="cid:registration-pass-qr" width="88" height="88" alt="QR code" style="display: block; margin-left: auto; border-radius: 8px;" />
              </td>
            </tr>
          </table>
        </div>

        <div style="padding: 12px 24px; background: #fafafa; border-top: 1px solid #f0f0f0;">
          <p style="margin: 0; font-size: 12px; color: #999;">Show this pass at check-in — your QR code and a calendar invite are attached.</p>
        </div>
      </div>
      <p style="text-align: center; color: #bbb; font-size: 11px; margin-top: 14px;">via KingdomFlow</p>
    </div>
  `;

  try {
    await sendBulkEmail({
      fromName: input.organizationName,
      subject: `You're registered for ${input.eventTitle}`,
      html,
      recipients: [input.to],
      attachments: [
        { filename: "registration-pass-qr.png", content: qrPng, contentType: "image/png", contentId: "registration-pass-qr" },
        { filename: "event.ics", content: Buffer.from(ics, "utf8"), contentType: "text/calendar" },
      ],
      organizationId: input.organizationId,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Registration pass email failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: input.organizationId,
      metadata: { to: input.to },
    });
  }
}
