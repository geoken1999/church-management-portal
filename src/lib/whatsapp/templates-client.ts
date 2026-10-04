import "server-only";

import { getMetaWhatsAppEnv } from "@/lib/whatsapp/env";
import { parseGraphError } from "@/lib/whatsapp/graph-error";
import type { WhatsAppTemplateCategory, WhatsAppTemplateStatus } from "@/types/database";

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
export async function createMetaTemplate(params: {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  bodyText: string;
  exampleValues: string[];
}): Promise<CreateTemplateResult> {
  const { businessAccountId } = getMetaWhatsAppEnv();

  const components =
    params.exampleValues.length > 0
      ? [{ type: "body", text: params.bodyText, example: { body_text: [params.exampleValues] } }]
      : [{ type: "body", text: params.bodyText }];

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
