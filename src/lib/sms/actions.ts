"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { sendSmsCampaign } from "@/lib/sms/send";

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

  let rawRecipients: unknown;
  try {
    rawRecipients = JSON.parse(String(formData.get("recipients") ?? "[]"));
  } catch {
    return { error: "Select at least one recipient." };
  }

  const result = await sendSmsCampaign({
    organizationId: membership.organization.id,
    userId: user.id,
    body: String(formData.get("body") ?? ""),
    rawRecipients,
  });
  revalidatePath(SMS_PATH);
  return result;
}
