import "server-only";

import { isMarketingCategory } from "@/lib/whatsapp/contact-health";
import { checkMarketingAllowed } from "@/lib/whatsapp/reputation";
import { renderTemplateText } from "@/lib/whatsapp/template-render";
import { logOutboundMessages, senderKeyFor, splitBlocked } from "@/lib/whatsapp/message-log";
import { getWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkWhatsAppQuota } from "@/lib/plans/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { sendBulkTemplateMessage } from "@/lib/whatsapp/client";
import { normalizePhoneNumber } from "@/lib/whatsapp/validation";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { parsePlaceholderSpecs, placeholderLabel, resolvePlaceholder, validatePlaceholderSpec, type MemberContext } from "@/lib/whatsapp/placeholders";
import { HEADER_IMAGE_BUCKET } from "@/lib/whatsapp/template-parts";
import type { WhatsAppCampaignStatus } from "@/types/database";

export interface SendWhatsAppResult {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
}

// Sends a WhatsApp template campaign and records it. Shared by the web
// WhatsApp page and the staff mobile app, so both follow the same rules:
// approved templates only, the shared number's marketing reputation pause,
// opted-out and WhatsApp-limited people skipped, the monthly quota, and the
// campaign and each message recorded. The caller has already checked the
// person may send WhatsApp messages.
export async function sendWhatsAppCampaign(input: {
  organizationId: string;
  userId: string;
  templateId: string;
  specsInput: unknown;
  rawRecipients: unknown;
}): Promise<SendWhatsAppResult> {
  const { organizationId, userId, templateId, specsInput, rawRecipients } = input;
  if (!templateId) return { error: "Select a message template." };

  if (!Array.isArray(rawRecipients)) {
    return { error: "Select at least one recipient." };
  }

  // One entry per phone number. A memberId links it to a member record, whose
  // details fill any member-field placeholders. Typed-in numbers have none.
  const seenPhones = new Set<string>();
  const recipients: { phone: string; memberId: string | null }[] = [];
  for (const entry of rawRecipients) {
    if (!entry || typeof entry !== "object") continue;
    const { phone, countryCode, memberId } = entry as { phone?: unknown; countryCode?: unknown; memberId?: unknown };
    if (typeof phone !== "string") continue;
    const normalized = normalizePhoneNumber(phone, typeof countryCode === "string" ? countryCode : null);
    if (!normalized || seenPhones.has(normalized)) continue;
    seenPhones.add(normalized);
    recipients.push({ phone: normalized, memberId: typeof memberId === "string" ? memberId : null });
  }

  if (recipients.length === 0) {
    return { error: "Select at least one valid recipient." };
  }

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("whatsapp_templates")
    .select("id, name, language, category, body_text, variable_count, status, header_type, header_image_path")
    .eq("id", templateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!template) return { error: "That template could not be found." };
  if (template.status !== "approved") return { error: "This template hasn't been approved by WhatsApp yet." };
  const specs = parsePlaceholderSpecs(specsInput, template.variable_count);
  if (!specs) {
    return { error: `Fill in all ${template.variable_count} placeholder${template.variable_count === 1 ? "" : "s"} before sending.` };
  }
  const specProblem = specs.map(validatePlaceholderSpec).find(Boolean);
  if (specProblem) return { error: specProblem };

  const marketing = isMarketingCategory(template.category);
  const credentials = await getWhatsAppCredentials(organizationId);
  const senderKey = senderKeyFor(credentials);

  // A church on the shared number whose recent messages keep being refused by
  // WhatsApp would drag every other church's standing down with it, so its
  // marketing sends pause until it gets back on track (or a platform admin
  // lifts it, or it connects its own number).
  if (marketing && credentials.source === "platform") {
    const reputationError = await checkMarketingAllowed(organizationId);
    if (reputationError) return { error: reputationError };
  }

  // Member details for the recipients that are members, for the placeholders
  // and the opt-out check. Read from the database here, not taken from the
  // browser, so a name can't be changed in transit.
  const memberIds = [...new Set(recipients.map((r) => r.memberId).filter((id): id is string => Boolean(id)))];
  const memberContexts = new Map<string, MemberContext>();
  const optedOut = new Set<string>();
  if (memberIds.length > 0) {
    const [{ data: members }, { data: branches }] = await Promise.all([
      admin.from("members").select("id, first_name, last_name, branch_id, whatsapp_opt_in").eq("organization_id", organizationId).in("id", memberIds),
      admin.from("branches").select("id, name").eq("organization_id", organizationId),
    ]);
    const branchNames = new Map((branches ?? []).map((b) => [b.id, b.name]));
    for (const m of members ?? []) {
      if (m.whatsapp_opt_in === false) optedOut.add(m.id);
      memberContexts.set(m.id, {
        firstName: m.first_name,
        fullName: `${m.first_name} ${m.last_name}`.trim(),
        branchName: m.branch_id ? branchNames.get(m.branch_id) ?? null : null,
      });
    }
  }

  const withParams = recipients.map((recipient) => {
    const member = recipient.memberId ? memberContexts.get(recipient.memberId) ?? null : null;
    const bodyParams = specs.map((spec) => resolvePlaceholder(spec, member));
    return { phone: recipient.phone, memberId: recipient.memberId, bodyParams, text: renderTemplateText(template.body_text, bodyParams) };
  });

  // Anyone who opted out (replied STOP) is never messaged by marketing.
  // WhatsApp also caps marketing messages per person: anyone it has recently
  // refused to deliver one to is skipped (shown as skipped, not failed)
  // instead of failing again and lowering this number's standing; they are
  // tried again after the pause. Other categories are never held back.
  const optOutSkipped = marketing ? withParams.filter((r) => r.memberId && optedOut.has(r.memberId)) : [];
  const notOptedOut = withParams.filter((r) => !optOutSkipped.includes(r));
  const { sendable: sendableAll, skipped: limitSkipped } = await splitBlocked(senderKey, marketing, notOptedOut);
  const skipped = [
    ...optOutSkipped.map((r) => ({ phone: r.phone, reason: "This person opted out of WhatsApp messages.", text: r.text })),
    ...limitSkipped.map((r) => ({ ...r, text: withParams.find((w) => w.phone === r.phone)?.text })),
  ] as { phone: string; reason: string; text?: string }[];
  const sendable = sendableAll;
  if (sendable.length === 0) {
    return {
      error: `Nothing was sent: ${skipped.length === 1 ? "this person has" : "these people have"} opted out, or WhatsApp is limiting marketing messages to them right now. Try again in a few days, or send by SMS or email.`,
      skippedCount: skipped.length,
    };
  }

  const quotaError = await checkWhatsAppQuota(organizationId, sendable.length);
  if (quotaError) return { error: quotaError };

  const sendList = sendable.map((r) => ({ phone: r.phone, bodyParams: r.bodyParams }));
  const textByPhone = new Map(withParams.map((r) => [r.phone, r.text]));

  // What actually gets stored/shown in history: the template body with each
  // placeholder shown as its typed value, or as a marker for a member field.
  const renderedBody = template.body_text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index: string) => {
    const spec = specs[Number(index) - 1];
    return spec ? placeholderLabel(spec) : `{{${index}}}`;
  });

  let result;
  try {
    const headerImageUrl =
      template.header_type === "image" && template.header_image_path
        ? admin.storage.from(HEADER_IMAGE_BUCKET).getPublicUrl(template.header_image_path).data.publicUrl
        : null;
    result = await sendBulkTemplateMessage({ templateName: template.name, languageCode: template.language, recipients: sendList, headerImageUrl, credentials });
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

  const { data: campaign } = await admin
    .from("whatsapp_campaigns")
    .insert({
      organization_id: organizationId,
      body: renderedBody,
      template_id: template.id,
      template_variables: specs.map(placeholderLabel),
      recipient_count: recipients.length,
      sent_count: result.sentCount,
      failed_count: result.failed.length,
      failed_recipients: result.failed.map((f) => ({ ...f, text: textByPhone.get(f.phone) })),
      skipped_count: skipped.length,
      skipped_recipients: skipped,
      status,
      sent_by: userId,
    })
    .select("id")
    .single();

  // So each message's delivery result, when WhatsApp reports it, lands on
  // this campaign (and the church's count stays honest).
  await logOutboundMessages(
    result.sentIds.map((sent) => ({
      organizationId,
      kind: "campaign" as const,
      refId: campaign?.id ?? null,
      recipient: sent.phone,
      wamid: sent.id,
      templateName: template.name,
      category: template.category,
      senderKey,
      bodyText: textByPhone.get(sent.phone) ?? null,
    })),
  );

  if (status === "failed") {
    return { error: result.failed[0]?.error ?? "Couldn't send that message.", sentCount: 0, failedCount: sendable.length, skippedCount: skipped.length };
  }

  return { success: true, sentCount: result.sentCount, failedCount: result.failed.length, skippedCount: skipped.length };
}
