import "server-only";

import twilio from "twilio";
import { getSmsEnv } from "@/lib/sms/env";
import { getSiteUrl } from "@/lib/site-url";

export interface SendBulkSmsResult {
  sentCount: number;
  failed: { phone: string; error: string }[];
}

// Twilio has no batch-send endpoint like Resend's — each recipient is its
// own messages.create() call, sequentially, same reasoning as the SMTP
// path: avoid bursting a provider that may rate-limit concurrent sends.
//
// organizationId is only used to build the statusCallback URL (see
// src/app/api/twilio/status-callback) — it has no bearing on the send
// itself, since SMS has no per-org "bring your own Twilio" option. A
// resolving messages.create() call only means Twilio ACCEPTED the send,
// not that it reached the recipient; the status callback is what reports
// actual delivery/failure, asynchronously, later.
export async function sendBulkSms(params: { body: string; recipients: string[]; organizationId: string }): Promise<SendBulkSmsResult> {
  const { accountSid, authToken, messagingServiceSid, fromNumber } = getSmsEnv();
  const client = twilio(accountSid, authToken);
  const statusCallback = `${getSiteUrl()}/api/twilio/status-callback?organizationId=${params.organizationId}&channel=sms`;

  let sentCount = 0;
  const failed: { phone: string; error: string }[] = [];

  for (const phone of params.recipients) {
    try {
      await client.messages.create({
        to: phone,
        body: params.body,
        statusCallback,
        ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber }),
      });
      sentCount += 1;
    } catch (err) {
      failed.push({ phone, error: err instanceof Error ? err.message : "Send failed." });
    }
  }

  return { sentCount, failed };
}
