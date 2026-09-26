"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { sendBulkSms } from "@/lib/sms/client";
import { normalizePhoneNumber } from "@/lib/sms/validation";
import { checkSmsQuota } from "@/lib/plans/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { SmsCampaignStatus } from "@/types/database";

const SMS_PATH = "/dashboard/sms";

export interface SendSmsState {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

export async function sendBulkSmsAction(formData: FormData): Promise<SendSmsState> {
  const user = await requireUser();
  const membership = await requireOrganization();

  if (!membership.tabAccess.sms.write) {
    return { error: "You don't have permission to send SMS." };
  }

  const body = String(formData.get("body") ?? "").trim();
  const recipientsRaw = String(formData.get("recipients") ?? "[]");

  if (!body) {
    return { error: "Write a message before sending." };
  }

  let rawRecipients: unknown;
  try {
    rawRecipients = JSON.parse(recipientsRaw);
  } catch {
    return { error: "Select at least one recipient." };
  }

  if (!Array.isArray(rawRecipients)) {
    return { error: "Select at least one recipient." };
  }

  // Each entry carries the country its number should be parsed with
  // (resolved client-side from the recipient's branch, falling back to
  // the org's country) — re-normalized here rather than trusted as-is,
  // same as every other user-controlled form value.
  const recipients = Array.from(
    new Set(
      rawRecipients
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const { phone, countryCode } = entry as { phone?: unknown; countryCode?: unknown };
          if (typeof phone !== "string") return null;
          return normalizePhoneNumber(phone, typeof countryCode === "string" ? countryCode : null);
        })
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );

  if (recipients.length === 0) {
    return { error: "Select at least one valid recipient." };
  }

  const quotaError = await checkSmsQuota(membership.organization.id, recipients.length);
  if (quotaError) {
    return { error: quotaError };
  }

  let result;
  try {
    result = await sendBulkSms({ body, recipients, organizationId: membership.organization.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send that message.";
    await logPlatformEvent({
      level: "error",
      source: "sms_send",
      message: `SMS send failed: ${message}`,
      organizationId: membership.organization.id,
      metadata: { recipientCount: recipients.length },
    });
    return { error: message };
  }

  const status: SmsCampaignStatus =
    result.failed.length === 0 ? "sent" : result.sentCount === 0 ? "failed" : "partial_failure";

  // Recording the campaign is RLS-restricted to admins by default (see
  // migration 0034) — the admin client performs the actual insert so a
  // "member" role granted sms write via the tab permissions matrix can
  // still send; the tabAccess check above is what actually gates who
  // gets here.
  const admin = createAdminClient();
  await admin.from("sms_campaigns").insert({
    organization_id: membership.organization.id,
    body,
    recipient_count: recipients.length,
    sent_count: result.sentCount,
    failed_count: result.failed.length,
    failed_recipients: result.failed,
    status,
    sent_by: user.id,
  });

  revalidatePath(SMS_PATH);

  if (status === "failed") {
    return { error: result.failed[0]?.error ?? "Couldn't send that message.", sentCount: 0, failedCount: recipients.length };
  }

  return { success: true, sentCount: result.sentCount, failedCount: result.failed.length };
}
