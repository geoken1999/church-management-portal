"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkWhatsAppQuota } from "@/lib/plans/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sendBulkTemplateMessage, sendTextMessage } from "@/lib/whatsapp/client";
import { createMetaTemplate, deleteMetaTemplate, fetchMetaTemplateStatus } from "@/lib/whatsapp/templates-client";
import { getAiMode, setAiMode, getAiTypingState } from "@/lib/whatsapp/automation";
import {
  normalizePhoneNumber,
  validateWhatsAppBody,
  validateWhatsAppTemplateName,
  validateWhatsAppTemplateBody,
  validateWhatsAppTemplatePlaceholders,
  countTemplateVariables,
} from "@/lib/whatsapp/validation";
import { generateReply } from "@/lib/ai/openai";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import type { WhatsAppCampaignStatus, WhatsAppTemplateCategory } from "@/types/database";

const WHATSAPP_PATH = "/dashboard/whatsapp";

// A bad template hurts the one shared WhatsApp number's quality rating
// for every org on the platform, so creating/deleting one is admin-only —
// same bar as connecting/disconnecting a social account elsewhere in this
// app.
async function requireOrgAdmin(organizationId: string, authUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateFormState {
  error?: string;
  success?: boolean;
}

export async function createWhatsAppTemplateAction(_prevState: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!(await requireOrgAdmin(organizationId, user.id))) {
    return { error: "Only an owner or admin can create a WhatsApp template." };
  }

  const name = String(formData.get("name") ?? "").trim().toLowerCase();
  const category = String(formData.get("category") ?? "utility") as WhatsAppTemplateCategory;
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const exampleValuesRaw = String(formData.get("exampleValues") ?? "[]");

  const nameError = validateWhatsAppTemplateName(name);
  if (nameError) return { error: nameError };
  const bodyError = validateWhatsAppTemplateBody(bodyText);
  if (bodyError) return { error: bodyError };
  if (category !== "marketing" && category !== "utility" && category !== "authentication") {
    return { error: "Select a valid template category." };
  }

  const variableCount = countTemplateVariables(bodyText);
  let exampleValues: string[] = [];
  try {
    const parsed = JSON.parse(exampleValuesRaw);
    if (Array.isArray(parsed)) exampleValues = parsed.map((v) => String(v));
  } catch {
    // Leave exampleValues empty — Meta will reject the create call below
    // with a clear error if the template actually needs examples.
  }
  if (variableCount > 0 && exampleValues.length < variableCount) {
    return { error: `Provide an example value for each of the ${variableCount} placeholder${variableCount === 1 ? "" : "s"} in your message.` };
  }

  const admin = createAdminClient();

  let metaResult;
  try {
    metaResult = await createMetaTemplate({ name, language: "en_US", category, bodyText, exampleValues: exampleValues.slice(0, variableCount) });
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({
      level: "error",
      source: "whatsapp_template",
      message: `Template create failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
      metadata: { name, code: detail.code, type: detail.type },
    });
    return { error: detail.message };
  }

  // Meta's create response only ever returns {id, status} — never a
  // rejection reason — but a template can come back already REJECTED
  // (obvious policy violations are rejected synchronously, not just after
  // async review). Without this follow-up GET, rejected_reason stays null
  // forever unless the admin happens to click "Refresh status" — which
  // historically wasn't even shown for rejected templates (see the fix in
  // WhatsAppManager.tsx's TemplateRow). Best-effort: a failure here just
  // leaves rejected_reason null, same as before this fix.
  let rejectedReason: string | null = null;
  if (metaResult.status !== "pending_review" && metaResult.status !== "approved") {
    try {
      const detail = await fetchMetaTemplateStatus(metaResult.metaTemplateId);
      rejectedReason = detail.rejectedReason;
      metaResult = { ...metaResult, status: detail.status };
    } catch {
      // Leave rejectedReason null — the now-always-visible refresh button
      // (for any non-approved status) lets the admin retry later.
    }
  }

  const { error: insertError } = await admin.from("whatsapp_templates").insert({
    organization_id: organizationId,
    name,
    language: "en_US",
    category,
    body_text: bodyText,
    variable_count: variableCount,
    meta_template_id: metaResult.metaTemplateId,
    status: metaResult.status,
    rejected_reason: rejectedReason,
    created_by: user.id,
  });

  if (insertError) {
    return { error: insertError.message.includes("duplicate") ? "A template with that name already exists." : "Couldn't save that template." };
  }

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

export interface GenerateTemplateBodyResult {
  error?: string;
  bodyText?: string;
  exampleValues?: string[];
}

// Meta rejects a template whose {{...}} placeholders aren't plain
// sequential numbers — the natural way to write one by hand is
// {{name}}, {{date}}, which is exactly what fails (see
// validateWhatsAppTemplatePlaceholders's own comment). This turns a
// plain-English description into a correctly-numbered draft so an admin
// never has to get that syntax right themselves. Admin-only, same bar as
// creating a template directly — not metered against the org's AI-reply
// credit pool (that pool is for messages actually sent to end users; this
// is a one-off drafting aid an admin triggers rarely, and it's already
// gated to admins only).
const TEMPLATE_AI_SYSTEM_PROMPT = `You write WhatsApp Business message templates for churches, in the exact format Meta's WhatsApp Business API requires.

Rules you must follow exactly:
- Output ONLY a single JSON object, no markdown code fences, no commentary before or after it.
- Shape: {"body": "...", "variables": ["...", "..."]}
- "body" is the message text. Any place a value is personalized per recipient (a name, a date, an amount, etc.) must be written as a numbered placeholder: {{1}}, {{2}}, {{3}}, in order of first appearance — never a named placeholder like {{name}}, and never skip a number.
- "variables" is one short plain-English description per placeholder, in the same order (e.g. "the member's first name"), used as example text for Meta's reviewers. Include exactly one entry per placeholder in the body, no more, no fewer.
- Keep the user's intent, tone, and specific details (times, days, places) exactly as given — you are formatting their message correctly, not rewriting its meaning.
- The body must not start or end with a placeholder — keep plain text at the very start and end.
- Keep it concise and avoid promotional superlatives ("best", "amazing", "don't miss out") unless the user's own text already uses them.
- Do not invent a recipient's name, a link, or any detail the user didn't provide.`;

export async function generateWhatsAppTemplateBodyAction(organizationId: string, rawText: string): Promise<GenerateTemplateBodyResult> {
  const user = await requireUser();

  if (!(await requireOrgAdmin(organizationId, user.id))) {
    return { error: "Only an owner or admin can generate a template with AI." };
  }

  const trimmed = rawText.trim();
  if (!trimmed) return { error: "Describe the message you want to send." };

  let raw: string | null;
  try {
    raw = await generateReply(TEMPLATE_AI_SYSTEM_PROMPT, [{ role: "user", content: trimmed }]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't reach the AI service.";
    await logPlatformEvent({ level: "error", source: "whatsapp_template", message: `AI template generation failed: ${message}`, organizationId });
    return { error: "Couldn't reach the AI service. Try again, or write the template by hand." };
  }
  if (!raw) return { error: "The AI didn't return anything. Try rephrasing your message." };

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { error: "Couldn't understand the AI's response. Try again." };

  let parsed: { body?: unknown; variables?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { error: "Couldn't understand the AI's response. Try again." };
  }

  const bodyText = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const exampleValues = Array.isArray(parsed.variables) ? parsed.variables.map((v) => String(v)) : [];

  if (!bodyText) return { error: "The AI didn't produce any message text. Try again." };

  // Defensive — the AI occasionally still gets the numbering wrong;
  // surface it as an ordinary validation error rather than handing back a
  // draft that would just fail at Meta anyway.
  const placeholderError = validateWhatsAppTemplatePlaceholders(bodyText);
  if (placeholderError) {
    return { error: `The AI's draft wasn't quite right: ${placeholderError}` };
  }

  return { bodyText, exampleValues };
}

export async function refreshWhatsAppTemplateStatusAction(templateId: string): Promise<TemplateFormState> {
  await requireUser();

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("whatsapp_templates")
    .select("organization_id, meta_template_id")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { error: "That template could not be found." };

  const access = await checkTabAccess(template.organization_id, "whatsapp", "read");
  if (!access.ok) return { error: access.message };

  if (!template.meta_template_id) return { error: "This template was never submitted to WhatsApp." };

  try {
    const { status, rejectedReason } = await fetchMetaTemplateStatus(template.meta_template_id);
    await admin.from("whatsapp_templates").update({ status, rejected_reason: rejectedReason }).eq("id", templateId);
  } catch (err) {
    return { error: describeWhatsAppError(err).message };
  }

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

export async function deleteWhatsAppTemplateAction(templateId: string): Promise<TemplateFormState> {
  const user = await requireUser();

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("whatsapp_templates")
    .select("organization_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { error: "That template could not be found." };

  if (!(await requireOrgAdmin(template.organization_id, user.id))) {
    return { error: "Only an owner or admin can delete a WhatsApp template." };
  }

  try {
    await deleteMetaTemplate(template.name);
  } catch (err) {
    // If Meta already doesn't have it (e.g. the create call above
    // succeeded in our DB but the template was removed on Meta's side
    // independently), don't block deleting our own record over it.
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_template",
      message: `Template delete on Meta failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: template.organization_id,
      metadata: { code: detail.code, type: detail.type },
    });
  }

  await admin.from("whatsapp_templates").delete().eq("id", templateId);

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface SendWhatsAppState {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

export async function sendBulkWhatsAppAction(formData: FormData): Promise<SendWhatsAppState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const access = await checkTabAccess(organizationId, "whatsapp", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return { error: "Select a message template." };

  const variableValuesRaw = String(formData.get("variableValues") ?? "[]");
  let variableValues: string[] = [];
  try {
    const parsed = JSON.parse(variableValuesRaw);
    if (Array.isArray(parsed)) variableValues = parsed.map((v) => String(v));
  } catch {
    return { error: "Couldn't read the template's fill-in values." };
  }

  const recipientsRaw = String(formData.get("recipients") ?? "[]");
  let rawRecipients: unknown;
  try {
    rawRecipients = JSON.parse(recipientsRaw);
  } catch {
    return { error: "Select at least one recipient." };
  }
  if (!Array.isArray(rawRecipients)) {
    return { error: "Select at least one recipient." };
  }

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

  const quotaError = await checkWhatsAppQuota(organizationId, recipients.length);
  if (quotaError) return { error: quotaError };

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("whatsapp_templates")
    .select("id, name, language, body_text, variable_count, status")
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!template) return { error: "That template could not be found." };
  if (template.status !== "approved") return { error: "This template hasn't been approved by WhatsApp yet." };
  if (variableValues.length < template.variable_count) {
    return { error: `Fill in all ${template.variable_count} placeholder${template.variable_count === 1 ? "" : "s"} before sending.` };
  }

  // What actually gets stored/shown in history — the template body with
  // its {{n}} placeholders filled in, not the raw template source.
  const renderedBody = template.body_text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index: string) => variableValues[Number(index) - 1] ?? `{{${index}}}`);

  let result;
  try {
    result = await sendBulkTemplateMessage({ templateName: template.name, languageCode: template.language, bodyParams: variableValues.slice(0, template.variable_count), recipients });
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({
      level: "error",
      source: "whatsapp_send",
      message: `WhatsApp send failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
      metadata: { recipientCount: recipients.length, templateId, code: detail.code, type: detail.type },
    });
    return { error: detail.message };
  }

  const status: WhatsAppCampaignStatus =
    result.failed.length === 0 ? "sent" : result.sentCount === 0 ? "failed" : "partial_failure";

  await admin.from("whatsapp_campaigns").insert({
    organization_id: organizationId,
    body: renderedBody,
    template_id: template.id,
    template_variables: variableValues.slice(0, template.variable_count),
    recipient_count: recipients.length,
    sent_count: result.sentCount,
    failed_count: result.failed.length,
    failed_recipients: result.failed,
    status,
    sent_by: user.id,
  });

  revalidatePath(WHATSAPP_PATH);

  if (status === "failed") {
    return { error: result.failed[0]?.error ?? "Couldn't send that message.", sentCount: 0, failedCount: recipients.length };
  }

  return { success: true, sentCount: result.sentCount, failedCount: result.failed.length };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface SendWhatsAppReplyState {
  error?: string;
  success?: boolean;
}

export async function sendWhatsAppReplyAction(conversationId: string, body: string): Promise<SendWhatsAppReplyState> {
  await requireUser();

  const bodyError = validateWhatsAppBody(body);
  if (bodyError) return { error: bodyError };

  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("id, organization_id, phone_number")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { error: "That conversation could not be found." };
  }

  const access = await checkTabAccess(conversation.organization_id, "whatsapp", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  let messageId: string;
  try {
    const result = await sendTextMessage({ to: conversation.phone_number, body });
    messageId = result.id;
  } catch (err) {
    // The most common cause here is WhatsApp's 24-hour customer-service
    // window having closed since their last message — free text can only
    // ever be sent as a reply inside that window. describeWhatsAppError
    // covers the other common cause (an invalid/expired access token)
    // with its own clearer message instead of Meta's raw wording.
    return { error: describeWhatsAppError(err).message };
  }

  await admin.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    organization_id: conversation.organization_id,
    direction: "outbound",
    body,
    twilio_sid: messageId,
    status: "sent",
  });

  await admin
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 200) })
    .eq("id", conversation.id);

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

export async function markWhatsAppConversationRead(conversationId: string) {
  await requireUser();

  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("organization_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return;

  const access = await checkTabAccess(conversation.organization_id, "whatsapp", "read");
  if (!access.ok) return;

  await admin.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", conversationId);
  revalidatePath(WHATSAPP_PATH);
}

export async function getWhatsAppAiMode(organizationId: string, phoneNumber: string): Promise<boolean> {
  await requireUser();
  return getAiMode(organizationId, phoneNumber);
}

// Turning this on hands the conversation to the webhook handler entirely
// (see /api/whatsapp/webhook's POST) — every inbound message from this
// number gets an AI-generated reply sent automatically, with no human
// review, for as long as it stays enabled.
export async function setWhatsAppAiMode(organizationId: string, phoneNumber: string, enabled: boolean): Promise<void> {
  await requireUser();
  await setAiMode(organizationId, phoneNumber, enabled);
}

export async function getWhatsAppAiTypingState(organizationId: string, phoneNumber: string): Promise<boolean> {
  await requireUser();
  return getAiTypingState(organizationId, phoneNumber);
}
