import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkSms } from "@/lib/sms/client";
import { normalizePhoneNumber } from "@/lib/sms/validation";
import { checkSmsQuota } from "@/lib/plans/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { SmsCampaignStatus } from "@/types/database";

export interface SendSmsResult {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

// Sends an SMS campaign and records it. Shared by the web SMS page and the staff
// mobile app, so both follow the same rules: numbers are normalised by country,
// the church's monthly SMS quota is checked, and the campaign is recorded. The
// caller has already checked the person may send SMS.
export async function sendSmsCampaign(input: { organizationId: string; userId: string; body: string; rawRecipients: unknown }): Promise<SendSmsResult> {
  const body = input.body.trim();
  if (!body) return { error: "Write a message before sending." };
  if (!Array.isArray(input.rawRecipients)) return { error: "Select at least one recipient." };

  // Each entry carries the country its number should be parsed with
  // (resolved from the recipient's branch, falling back to the org's) —
  // re-normalized here rather than trusted as-is.
  const recipients = Array.from(
    new Set(
      input.rawRecipients
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const { phone, countryCode } = entry as { phone?: unknown; countryCode?: unknown };
          if (typeof phone !== "string") return null;
          return normalizePhoneNumber(phone, typeof countryCode === "string" ? countryCode : null);
        })
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );
  if (recipients.length === 0) return { error: "Select at least one valid recipient." };

  const quotaError = await checkSmsQuota(input.organizationId, recipients.length);
  if (quotaError) return { error: quotaError };

  let result;
  try {
    result = await sendBulkSms({ body, recipients, organizationId: input.organizationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send that message.";
    await logPlatformEvent({
      level: "error",
      source: "sms_send",
      message: `SMS send failed: ${message}`,
      organizationId: input.organizationId,
      metadata: { recipientCount: recipients.length },
    });
    return { error: message };
  }

  const status: SmsCampaignStatus = result.failed.length === 0 ? "sent" : result.sentCount === 0 ? "failed" : "partial_failure";

  // Recording the campaign is RLS-restricted to admins by default (migration
  // 0034), so the admin client does the insert; who may send was checked by the caller.
  const admin = createAdminClient();
  await admin.from("sms_campaigns").insert({
    organization_id: input.organizationId,
    body,
    recipient_count: recipients.length,
    sent_count: result.sentCount,
    failed_count: result.failed.length,
    failed_recipients: result.failed,
    status,
    sent_by: input.userId,
  });

  if (status === "failed") {
    return { error: result.failed[0]?.error ?? "Couldn't send that message.", sentCount: 0, failedCount: recipients.length };
  }
  return { success: true, sentCount: result.sentCount, failedCount: result.failed.length };
}
