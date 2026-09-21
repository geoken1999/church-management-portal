import "server-only";

import twilio from "twilio";
import { getSmsEnv } from "@/lib/sms/env";

export interface SendBulkSmsResult {
  sentCount: number;
  failed: { phone: string; error: string }[];
}

// Twilio has no batch-send endpoint like Resend's — each recipient is its
// own messages.create() call, sequentially, same reasoning as the SMTP
// path: avoid bursting a provider that may rate-limit concurrent sends.
export async function sendBulkSms(params: { body: string; recipients: string[] }): Promise<SendBulkSmsResult> {
  const { accountSid, authToken, messagingServiceSid, fromNumber } = getSmsEnv();
  const client = twilio(accountSid, authToken);

  let sentCount = 0;
  const failed: { phone: string; error: string }[] = [];

  for (const phone of params.recipients) {
    try {
      await client.messages.create({
        to: phone,
        body: params.body,
        ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber }),
      });
      sentCount += 1;
    } catch (err) {
      failed.push({ phone, error: err instanceof Error ? err.message : "Send failed." });
    }
  }

  return { sentCount, failed };
}
