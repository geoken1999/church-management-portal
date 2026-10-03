import "server-only";

import { getMetaWhatsAppEnv } from "@/lib/whatsapp/env";

// Meta documents recipient numbers without a leading '+' in request
// bodies (e.g. "16505551234"), and sends inbound `from` the same way —
// stored numbers in this app are E.164 with a leading '+', so this strips
// it only at the API boundary.
function toMetaRecipient(e164: string): string {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}

async function postToGraphMessages(body: Record<string, unknown>): Promise<string> {
  const { accessToken, phoneNumberId, apiVersion } = getMetaWhatsAppEnv();

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let message = errorBody;
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Not JSON — fall back to the raw body text above.
    }
    throw new Error(message || `WhatsApp send failed (${res.status}).`);
  }

  const data = (await res.json()) as { messages?: { id?: string }[] };
  const id = data.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp send returned no message id.");
  return id;
}

export interface SendResult {
  id: string;
}

// Free text — only deliverable within 24 hours of the recipient's last
// message to this number (WhatsApp's "customer service window"); outside
// that window Meta rejects it and sendTemplateMessage must be used
// instead. Used for chat replies and the AI auto-reply, both of which only
// ever fire in direct response to an inbound message.
export async function sendTextMessage(params: { to: string; body: string }): Promise<SendResult> {
  const id = await postToGraphMessages({
    to: toMetaRecipient(params.to),
    type: "text",
    text: { body: params.body },
  });
  return { id };
}

// Business-initiated sends (campaigns) must use a pre-approved template —
// see whatsapp/templates-client.ts for creating/approving one. `bodyParams`
// fills the template body's {{1}}, {{2}}, ... placeholders in order, the
// same values for every recipient (not personalized per-recipient).
export async function sendTemplateMessage(params: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams: string[];
}): Promise<SendResult> {
  const id = await postToGraphMessages({
    to: toMetaRecipient(params.to),
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      ...(params.bodyParams.length > 0
        ? { components: [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  });
  return { id };
}

export interface SendBulkTemplateResult {
  sentCount: number;
  failed: { phone: string; error: string }[];
}

// Sequential, one Graph API call per recipient — same shape as the old
// Twilio sendBulkWhatsApp, to avoid bursting Meta's rate limits.
export async function sendBulkTemplateMessage(params: {
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  recipients: string[];
}): Promise<SendBulkTemplateResult> {
  let sentCount = 0;
  const failed: { phone: string; error: string }[] = [];

  for (const phone of params.recipients) {
    try {
      await sendTemplateMessage({ to: phone, templateName: params.templateName, languageCode: params.languageCode, bodyParams: params.bodyParams });
      sentCount += 1;
    } catch (err) {
      failed.push({ phone, error: err instanceof Error ? err.message : "Send failed." });
    }
  }

  return { sentCount, failed };
}
