import "server-only";

import { getPlatformWhatsAppCredentials, type WhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { parseGraphError, GraphApiError, describeWhatsAppError } from "@/lib/whatsapp/graph-error";

// Meta documents recipient numbers without a leading '+' in request
// bodies (e.g. "16505551234"), and sends inbound `from` the same way —
// stored numbers in this app are E.164 with a leading '+', so this strips
// it only at the API boundary.
function toMetaRecipient(e164: string): string {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}

async function postToGraphMessages(body: Record<string, unknown>, credentials?: WhatsAppCredentials): Promise<string> {
  const { accessToken, phoneNumberId, apiVersion } = credentials ?? getPlatformWhatsAppCredentials();

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
  });

  if (!res.ok) {
    throw await parseGraphError(res);
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
export async function sendTextMessage(params: { to: string; body: string; credentials?: WhatsAppCredentials }): Promise<SendResult> {
  const id = await postToGraphMessages(
    {
      to: toMetaRecipient(params.to),
      type: "text",
      text: { body: params.body },
    },
    params.credentials,
  );
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
  headerImageUrl?: string | null;
  // Fills the {{1}} of a template's first button when that button is a
  // dynamic link (e.g. https://site/pass/{{1}}).
  buttonUrlParam?: string | null;
  credentials?: WhatsAppCredentials;
}): Promise<SendResult> {
  const components = [
    ...(params.headerImageUrl ? [{ type: "header", parameters: [{ type: "image", image: { link: params.headerImageUrl } }] }] : []),
    ...(params.bodyParams.length > 0 ? [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) }] : []),
    ...(params.buttonUrlParam ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params.buttonUrlParam }] }] : []),
  ];
  const id = await postToGraphMessages(
    {
      to: toMetaRecipient(params.to),
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    },
    params.credentials,
  );
  return { id };
}

export interface SendBulkTemplateResult {
  sentCount: number;
  // The WhatsApp message id of each accepted message, so its delivery can be
  // tracked later (see message-log.ts).
  sentIds: { phone: string; id: string }[];
  failed: { phone: string; error: string }[];
}

// Sequential, one Graph API call per recipient — same shape as the old
// Twilio sendBulkWhatsApp, to avoid bursting Meta's rate limits.
// Each recipient carries its own placeholder values, so a template can greet
// every member by name.
export async function sendBulkTemplateMessage(params: {
  templateName: string;
  languageCode: string;
  recipients: { phone: string; bodyParams: string[] }[];
  headerImageUrl?: string | null;
  credentials?: WhatsAppCredentials;
}): Promise<SendBulkTemplateResult> {
  let sentCount = 0;
  const sentIds: { phone: string; id: string }[] = [];
  const failed: { phone: string; error: string }[] = [];

  for (const [index, { phone, bodyParams }] of params.recipients.entries()) {
    try {
      const { id } = await sendTemplateMessage({
        to: phone,
        templateName: params.templateName,
        languageCode: params.languageCode,
        bodyParams,
        headerImageUrl: params.headerImageUrl,
        credentials: params.credentials,
      });
      sentCount += 1;
      sentIds.push({ phone, id });
    } catch (err) {
      failed.push({ phone, error: describeWhatsAppError(err).message });
      // An invalid/expired access token fails identically for every
      // recipient — stop immediately instead of repeating the same
      // doomed call (and its rate-limit cost) for everyone left in the
      // list, and mark the rest failed with the same reason.
      if (err instanceof GraphApiError && err.isAuthError) {
        const remaining = params.recipients.slice(index + 1);
        failed.push(...remaining.map((r) => ({ phone: r.phone, error: describeWhatsAppError(err).message })));
        break;
      }
    }
  }

  return { sentCount, sentIds, failed };
}
