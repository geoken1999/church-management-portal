import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateMessage, sendBulkTemplateMessage } from "@/lib/whatsapp/client";
import { normalizePhoneNumber } from "@/lib/whatsapp/validation";
import { resolveBodyParams } from "@/lib/automations/template-mapping";
import { buildCelebrantList, buildDirectIdempotencyKey, buildDigestIdempotencyKey } from "@/lib/automations/date-logic";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { AutomationDestination, AutomationTemplate, AutomationTrigger, Member } from "@/types/database";

export { buildCelebrantList, buildDirectIdempotencyKey, buildDigestIdempotencyKey } from "@/lib/automations/date-logic";

type AdminClient = ReturnType<typeof createAdminClient>;

async function fetchApprovedTemplate(admin: AdminClient, templateId: string): Promise<AutomationTemplate | null> {
  const { data } = await admin.from("automation_templates").select("*").eq("id", templateId).maybeSingle();
  if (!data || data.status !== "approved") return null;
  return data;
}

export async function sendDirectMemberMessage(
  admin: AdminClient,
  trigger: AutomationTrigger,
  member: Member,
  occasionLabel: string,
  occurrenceYear: number,
  organizationName: string,
): Promise<void> {
  if (!trigger.template_id) return;
  const template = await fetchApprovedTemplate(admin, trigger.template_id);
  if (!template) return; // not approved yet — skip silently, nothing to reserve

  const phone = normalizePhoneNumber(member.phone ?? "");
  if (!phone) return;

  const key = buildDirectIdempotencyKey(trigger.id, member.id, occurrenceYear);
  const { data: reserved } = await admin
    .from("automation_executions")
    .insert({
      organization_id: trigger.organization_id,
      automation_id: trigger.automation_id,
      destination_kind: "direct_member",
      trigger_id: trigger.id,
      member_id: member.id,
      idempotency_key: key,
      status: "sent",
      recipient_count: 1,
    })
    .select("id")
    .single();
  if (!reserved) return; // unique violation -> already sent this occurrence

  const values: Record<string, string> = {
    first_name: member.first_name,
    church_name: organizationName,
    occasion_label: occasionLabel,
  };
  const bodyParams = resolveBodyParams(template.variable_names, values);

  try {
    const { id } = await sendTemplateMessage({ to: phone, templateName: template.meta_template_name, languageCode: template.language, bodyParams });
    await admin.from("automation_executions").update({ meta_message_id: id }).eq("id", reserved.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    await admin.from("automation_executions").update({ status: "failed", error_message: message }).eq("id", reserved.id);
    await logPlatformEvent({ level: "error", source: "automation_send", message, organizationId: trigger.organization_id, metadata: { memberId: member.id, triggerId: trigger.id } });
  }
}

export async function sendStaffDigest(
  admin: AdminClient,
  automationId: string,
  organizationId: string,
  destination: AutomationDestination,
  celebrantsToday: { name: string; occasionLabel: string }[],
  now: Date = new Date(),
): Promise<void> {
  if (celebrantsToday.length === 0) return;
  if (!destination.digest_template_id || !destination.recipient_phones?.length) return;

  const template = await fetchApprovedTemplate(admin, destination.digest_template_id);
  if (!template) return;

  const key = buildDigestIdempotencyKey(automationId, now);
  const { data: reserved } = await admin
    .from("automation_executions")
    .insert({
      organization_id: organizationId,
      automation_id: automationId,
      destination_kind: "staff_digest",
      idempotency_key: key,
      status: "sent",
      recipient_count: destination.recipient_phones.length,
    })
    .select("id")
    .single();
  if (!reserved) return;

  const celebrantList = buildCelebrantList(celebrantsToday);
  const bodyParams = resolveBodyParams(template.variable_names, { celebrant_list: celebrantList });

  const result = await sendBulkTemplateMessage({
    templateName: template.meta_template_name,
    languageCode: template.language,
    bodyParams,
    recipients: destination.recipient_phones,
  });

  const allFailed = result.failed.length === destination.recipient_phones.length;
  if (allFailed) {
    const message = result.failed[0]?.error ?? "Digest send failed.";
    await admin.from("automation_executions").update({ status: "failed", error_message: message }).eq("id", reserved.id);
    await logPlatformEvent({ level: "error", source: "automation_send", message, organizationId, metadata: { automationId } });
  }
}
