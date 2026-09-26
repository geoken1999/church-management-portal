import "server-only";

import twilio from "twilio";
import { getSiteUrl } from "@/lib/site-url";

export interface WhatsAppCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

function statusCallbackUrl(organizationId: string, mode: "own" | "shared"): string {
  return `${getSiteUrl()}/api/twilio/status-callback?organizationId=${organizationId}&channel=whatsapp&mode=${mode}`;
}

function toWhatsAppAddress(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

export interface SendBulkWhatsAppResult {
  sentCount: number;
  failed: { phone: string; error: string }[];
}

// Same shape as sendBulkSms (src/lib/sms/client.ts) — one messages.create()
// per recipient, sequential to avoid bursting Twilio's rate limits.
// Credentials are passed in explicitly (rather than read from env here)
// since a campaign can run against either the shared platform account or
// an org's own connected Twilio account.
export async function sendBulkWhatsApp(params: {
  credentials: WhatsAppCredentials;
  body: string;
  recipients: string[];
  organizationId: string;
  mode: "own" | "shared";
}): Promise<SendBulkWhatsAppResult> {
  const { accountSid, authToken, fromNumber } = params.credentials;
  const client = twilio(accountSid, authToken);
  const statusCallback = statusCallbackUrl(params.organizationId, params.mode);

  let sentCount = 0;
  const failed: { phone: string; error: string }[] = [];

  for (const phone of params.recipients) {
    try {
      await client.messages.create({
        to: toWhatsAppAddress(phone),
        from: toWhatsAppAddress(fromNumber),
        body: params.body,
        statusCallback,
      });
      sentCount += 1;
    } catch (err) {
      failed.push({ phone, error: err instanceof Error ? err.message : "Send failed." });
    }
  }

  return { sentCount, failed };
}

export interface SendWhatsAppMessageResult {
  sid: string;
}

// Single-recipient send, used for chat replies (as opposed to
// sendBulkWhatsApp's campaign loop) — chat is own-mode only (see migration
// 0058), so the status callback is always tagged mode=own.
export async function sendWhatsAppMessage(params: {
  credentials: WhatsAppCredentials;
  to: string;
  body: string;
  organizationId: string;
}): Promise<SendWhatsAppMessageResult> {
  const { accountSid, authToken, fromNumber } = params.credentials;
  const client = twilio(accountSid, authToken);

  const message = await client.messages.create({
    to: toWhatsAppAddress(params.to),
    from: toWhatsAppAddress(fromNumber),
    body: params.body,
    statusCallback: statusCallbackUrl(params.organizationId, "own"),
  });

  return { sid: message.sid };
}
