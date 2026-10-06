import "server-only";

import { getMetaWhatsAppEnv } from "@/lib/whatsapp/env";
import { parseGraphError } from "@/lib/whatsapp/graph-error";
import type { WhatsAppTemplateButton, WhatsAppTemplateCategory, WhatsAppTemplateStatus } from "@/types/database";
import { metaButtonsComponent, metaHeaderComponent } from "@/lib/whatsapp/template-parts";

function metaStatusToLocal(status: string): WhatsAppTemplateStatus {
  const lowered = status.toLowerCase();
  if (lowered === "approved" || lowered === "rejected" || lowered === "paused" || lowered === "disabled") return lowered;
  return "pending_review";
}

// Meta's message_templates endpoint requires category as uppercase
// ("MARKETING" | "UTILITY" | "AUTHENTICATION") — this app's own type/DB
// enum stays lowercase (matches the rest of the UI/validation), so this
// converts only at the API boundary. Sending it lowercase doesn't error
// clearly — it comes back as a bare, generic "Invalid parameter" (code
// 100) with nothing pointing at which field was wrong, which is exactly
// what every template-create call failed with live until this fix.
function toMetaCategory(category: WhatsAppTemplateCategory): string {
  return category.toUpperCase();
}

async function graphFetch(path: string, init: RequestInit): Promise<Response> {
  const { accessToken, apiVersion } = getMetaWhatsAppEnv();
  return fetch(`https://graph.facebook.com/${apiVersion}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
}

export interface CreateTemplateResult {
  metaTemplateId: string;
  status: WhatsAppTemplateStatus;
}

// Submits a new template for Meta's review. `bodyText` uses {{1}}, {{2}},
// ... placeholders; `exampleValues` gives one sample value per placeholder
// (Meta requires an example to review the template against).
// Meta needs an example image to review an image header. It's uploaded once
// through the app's upload session, and the handle Meta returns goes on the
// template. The app ID is the Meta app that owns the WhatsApp account.
export async function uploadTemplateHeaderSample(params: { bytes: Uint8Array; mime: string; fileName: string }): Promise<string> {
  const appId = process.env.META_WHATSAPP_APP_ID;
  if (!appId) throw new Error("META_WHATSAPP_APP_ID must be set to add an image header to a template.");
  const { accessToken, apiVersion } = getMetaWhatsAppEnv();

  const session = await fetch(
    `https://graph.facebook.com/${apiVersion}/${appId}/uploads?file_name=${encodeURIComponent(params.fileName)}&file_length=${params.bytes.length}&file_type=${encodeURIComponent(params.mime)}`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!session.ok) throw await parseGraphError(session);
  const { id: sessionId } = (await session.json()) as { id?: string };
  if (!sessionId) throw new Error("Meta did not start an upload session.");

  const upload = await fetch(`https://graph.facebook.com/${apiVersion}/${sessionId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0" },
    body: params.bytes as unknown as BodyInit,
  });
  if (!upload.ok) throw await parseGraphError(upload);
  const { h } = (await upload.json()) as { h?: string };
  if (!h) throw new Error("Meta did not return a header handle.");
  return h;
}

export async function createMetaTemplate(params: {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  bodyText: string;
  exampleValues: string[];
  headerHandle?: string | null;
  buttons?: WhatsAppTemplateButton[];
}): Promise<CreateTemplateResult> {
  const { businessAccountId } = getMetaWhatsAppEnv();

  const body =
    params.exampleValues.length > 0
      ? { type: "body", text: params.bodyText, example: { body_text: [params.exampleValues] } }
      : { type: "body", text: params.bodyText };
  const buttons = metaButtonsComponent(params.buttons ?? []);
  const components = [
    ...(params.headerHandle ? [metaHeaderComponent(params.headerHandle)] : []),
    body,
    ...(buttons ? [buttons] : []),
  ];

  const res = await graphFetch(`${businessAccountId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ name: params.name, language: params.language, category: toMetaCategory(params.category), components }),
  });

  if (!res.ok) throw await parseGraphError(res);

  const data = (await res.json()) as { id?: string; status?: string };
  if (!data.id) throw new Error("Meta did not return a template id.");
  return { metaTemplateId: data.id, status: data.status ? metaStatusToLocal(data.status) : "pending_review" };
}

export async function fetchMetaTemplateStatus(metaTemplateId: string): Promise<{ status: WhatsAppTemplateStatus; rejectedReason: string | null }> {
  const res = await graphFetch(`${metaTemplateId}?fields=status,rejected_reason`, { method: "GET" });
  if (!res.ok) throw await parseGraphError(res);

  const data = (await res.json()) as { status?: string; rejected_reason?: string };
  return { status: data.status ? metaStatusToLocal(data.status) : "pending_review", rejectedReason: data.rejected_reason ?? null };
}

// Documented as delete-by-name against the WABA (not by template id) —
// removes every language variant registered under that name.
export async function deleteMetaTemplate(name: string): Promise<void> {
  const { businessAccountId } = getMetaWhatsAppEnv();
  const res = await graphFetch(`${businessAccountId}/message_templates?name=${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) throw await parseGraphError(res);
}
