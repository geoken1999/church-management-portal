import "server-only";

import { getEmailSmtpSettings } from "@/lib/email/dal";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { sendBulkEmailViaSmtp } from "@/lib/email/smtp";

export type MembershipEmailResult = { ok: true; via: "shared" | "own" } | { ok: false; error: string };

// One email per member, because each carries that member's own payment link.
// Uses the church's own SMTP sender when it has one, otherwise the shared
// sender. The caller checks the shared allowance before calling this, and
// records which sender was used.
export async function sendMembershipEmail(params: {
  organizationId: string;
  organizationName: string;
  to: string;
  subject: string;
  html: string;
}): Promise<MembershipEmailResult> {
  const smtp = await getEmailSmtpSettings(params.organizationId);
  if (!smtp && !isEmailConfigured()) {
    return { ok: false, error: "Email isn't configured." };
  }

  try {
    const result = smtp
      ? await sendBulkEmailViaSmtp(
          {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            username: smtp.username,
            password: smtp.password,
            fromEmail: smtp.from_email,
            fromName: smtp.from_name || params.organizationName,
          },
          { subject: params.subject, html: params.html, recipients: [params.to] },
        )
      : await sendBulkEmail({
          fromName: params.organizationName,
          subject: params.subject,
          html: params.html,
          recipients: [params.to],
          organizationId: params.organizationId,
        });

    if (result.sentCount === 0) {
      return { ok: false, error: result.failed[0]?.error ?? "The email wasn't sent." };
    }
    return { ok: true, via: smtp ? "own" : "shared" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The email wasn't sent." };
  }
}
