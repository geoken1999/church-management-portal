import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email/client";
import { sendBulkEmailViaSmtp } from "@/lib/email/smtp";
import { getEmailSmtpSettings } from "@/lib/email/dal";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { checkEmailQuota } from "@/lib/plans/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { EmailAttachment } from "@/lib/email/client";
import type { EmailCampaignStatus, EmailCampaignProvider } from "@/types/database";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailResult {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

// Sends an email campaign and records it. Shared by the web Email page and the
// staff mobile app so both follow the same rules: the message is sanitised, a
// church's own SMTP is used when set (otherwise the shared sender, metered by
// plan), and the campaign is recorded. The caller has already checked the
// person may send email.
export async function sendEmailCampaign(input: {
  organizationId: string;
  organizationName: string;
  userId: string;
  userEmail: string | null;
  subject: string;
  html: string;
  rawRecipients: unknown;
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const subject = input.subject.trim();
  if (!subject) return { error: "Subject is required." };

  const cleanHtml = sanitizeEmailHtml(input.html);
  const plainText = cleanHtml.replace(/<[^>]+>/g, "").trim();
  if (!plainText) return { error: "Write a message before sending." };

  if (!Array.isArray(input.rawRecipients)) return { error: "Select at least one recipient." };
  const recipients = Array.from(
    new Set(
      input.rawRecipients
        .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
        .filter((email) => EMAIL_PATTERN.test(email)),
    ),
  );
  if (recipients.length === 0) return { error: "Select at least one valid recipient." };

  const attachments = input.attachments ?? [];
  const smtpSettings = await getEmailSmtpSettings(input.organizationId);
  const provider: EmailCampaignProvider = smtpSettings ? "smtp" : "shared";

  // The shared sender is metered by plan; a church's own SMTP isn't.
  if (provider === "shared") {
    const quotaError = await checkEmailQuota(input.organizationId, recipients.length);
    if (quotaError) return { error: quotaError };
  }

  let result;
  try {
    result = smtpSettings
      ? await sendBulkEmailViaSmtp(
          {
            host: smtpSettings.host,
            port: smtpSettings.port,
            secure: smtpSettings.secure,
            username: smtpSettings.username,
            password: smtpSettings.password,
            fromEmail: smtpSettings.from_email,
            fromName: smtpSettings.from_name || input.organizationName,
          },
          { subject, html: cleanHtml, recipients, replyTo: input.userEmail ?? undefined, attachments },
        )
      : await sendBulkEmail({
          fromName: input.organizationName,
          subject,
          html: cleanHtml,
          recipients,
          replyTo: input.userEmail ?? undefined,
          attachments,
          organizationId: input.organizationId,
        });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send that email.";
    await logPlatformEvent({
      level: "error",
      source: "email_send",
      message: `Email send failed: ${message}`,
      organizationId: input.organizationId,
      metadata: { recipientCount: recipients.length, provider },
    });
    return { error: message };
  }

  const status: EmailCampaignStatus = result.failed.length === 0 ? "sent" : result.sentCount === 0 ? "failed" : "partial_failure";

  // Recording the campaign is RLS-restricted to admins by default (migration
  // 0026), so the admin client does the insert; who may send was checked by the caller.
  const admin = createAdminClient();
  await admin.from("email_campaigns").insert({
    organization_id: input.organizationId,
    subject,
    body_html: cleanHtml,
    recipient_count: recipients.length,
    sent_count: result.sentCount,
    failed_count: result.failed.length,
    failed_recipients: result.failed,
    status,
    provider,
    sent_by: input.userId,
  });

  if (status === "failed") {
    return { error: result.failed[0]?.error ?? "Couldn't send that email.", sentCount: 0, failedCount: recipients.length };
  }
  return { success: true, sentCount: result.sentCount, failedCount: result.failed.length };
}
