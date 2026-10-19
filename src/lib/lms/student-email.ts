import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { PLAY_STORE_URL } from "@/lib/app-links";
import { logPlatformEvent } from "@/lib/platform-events/log";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tells a new student they are in, and how to start (the app, or the web page for learners).
export async function emailStudentApproved(
  organizationName: string,
  email: string,
  firstName: string,
  courseTitle: string | null,
  options: { paid?: boolean; learnUrl?: string } = {},
): Promise<void> {
  if (!isEmailConfigured() || !email) return;
  try {
    await sendBulkEmail({
      fromName: organizationName,
      subject: `You're in: ${organizationName} Bible School`,
      html: `<div style="font-family:sans-serif;max-width:480px"><p>Hi ${escapeHtml(firstName)},</p><p>${
        options.paid
          ? "Thank you for your payment. You are"
          : "Your application to the " +
            escapeHtml(organizationName) +
            " Bible School was approved and you are"
      } enrolled${
        courseTitle ? ` in <strong>${escapeHtml(courseTitle)}</strong>` : ""
      }.</p><p>To start, sign in with the mobile number you used:</p>${
        options.learnUrl
          ? `<p><a href="${options.learnUrl}">Open your courses on the web</a></p>`
          : ""
      }<p><a href="${PLAY_STORE_URL}">Or get the app on Google Play</a></p></div>`,
      recipients: [email],
    });
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Bible School approval email failed: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }
}
