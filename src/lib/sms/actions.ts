"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { sendBulkSms } from "@/lib/sms/client";
import { normalizePhoneNumber } from "@/lib/sms/validation";
import { checkSmsQuota } from "@/lib/plans/dal";
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

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can send SMS." };
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
    result = await sendBulkSms({ body, recipients });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that message." };
  }

  const status: SmsCampaignStatus =
    result.failed.length === 0 ? "sent" : result.sentCount === 0 ? "failed" : "partial_failure";

  const supabase = await createClient();
  await supabase.from("sms_campaigns").insert({
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
