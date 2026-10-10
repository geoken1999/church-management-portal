import "server-only";

import { getWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateMessage, sendBulkTemplateMessage } from "@/lib/whatsapp/client";
import { normalizePhoneNumber, resolvePhoneCountry } from "@/lib/whatsapp/validation";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { resolveBodyParams, resolveVariableValues } from "@/lib/automations/template-mapping";
import { buildCelebrantList, buildDirectIdempotencyKey, buildDigestIdempotencyKey } from "@/lib/automations/date-logic";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import type { AutomationDestination, AutomationTemplate, AutomationTrigger, Member } from "@/types/database";

export { buildCelebrantList, buildDirectIdempotencyKey, buildDigestIdempotencyKey } from "@/lib/automations/date-logic";

type AdminClient = ReturnType<typeof createAdminClient>;

async function fetchApprovedTemplate(admin: AdminClient, templateId: string): Promise<AutomationTemplate | null> {
  const { data } = await admin.from("automation_templates").select("*").eq("id", templateId).maybeSingle();
  if (!data || data.status !== "approved") return null;
  return data;
}

// Every other phone-normalizing send (the SMS/WhatsApp composers) resolves
// this client-side, from the recipient's own branch falling back to the
// org's country, before ever calling normalizePhoneNumber — see
// resolvePhoneCountry's own comment. This automation has no UI step to do
// that in (it's cron-driven, not form-submitted), so it resolves the same
// fallback itself. Without this, a member's phone stored without a country
// code (the common case for members entered as plain 10-digit numbers)
// fails to parse at all, and normalizePhoneNumber's default-to-undefined
// behavior made the send silently no-op — no execution row, no error
// logged, nothing — rather than fail loudly.
async function resolveMemberPhoneCountry(admin: AdminClient, member: Member, organizationId: string): Promise<string | null> {
  const [{ data: branch }, { data: org }] = await Promise.all([
    member.branch_id ? admin.from("branches").select("country").eq("id", member.branch_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("organizations").select("country").eq("id", organizationId).maybeSingle(),
  ]);
  return resolvePhoneCountry(branch?.country, org?.country);
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

  const phoneCountry = await resolveMemberPhoneCountry(admin, member, trigger.organization_id);
  const phone = normalizePhoneNumber(member.phone ?? "", phoneCountry);
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

  const values = resolveVariableValues(
    template.variable_names,
    {
      first_name: member.first_name,
      last_name: member.last_name,
      full_name: `${member.first_name} ${member.last_name}`.trim(),
      church_name: organizationName,
      occasion_label: occasionLabel,
    },
    trigger.variable_values,
  );
  const bodyParams = resolveBodyParams(template.variable_names, values);

  try {
    const { id } = await sendTemplateMessage({
      to: phone,
      templateName: template.meta_template_name,
      languageCode: template.language,
      bodyParams,
      credentials: await getWhatsAppCredentials(trigger.organization_id),
    });
    await admin.from("automation_executions").update({ meta_message_id: id }).eq("id", reserved.id);
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await admin.from("automation_executions").update({ status: "failed", error_message: detail.message }).eq("id", reserved.id);
    await logPlatformEvent({
      level: "error",
      source: "automation_send",
      message: err instanceof Error ? err.message : "Send failed.",
      organizationId: trigger.organization_id,
      metadata: { memberId: member.id, triggerId: trigger.id, code: detail.code, type: detail.type },
    });
  }
}

// Digest recipients are the selected leaders' member phones, resolved at
// send time (so a phone edit is picked up), plus any legacy hand-typed
// numbers saved before leaders became the source. Deduped on the
// normalized number.
async function resolveDigestRecipientPhones(admin: AdminClient, destination: AutomationDestination, organizationId: string): Promise<string[]> {
  const phones = new Set<string>();
  for (const phone of destination.recipient_phones ?? []) phones.add(phone);

  if (destination.recipient_leader_ids?.length) {
    const [{ data: leaders }, { data: org }] = await Promise.all([
      admin
        .from("leaders")
        .select("members(phone, branch_id)")
        .eq("organization_id", organizationId)
        .in("id", destination.recipient_leader_ids),
      admin.from("organizations").select("country").eq("id", organizationId).maybeSingle(),
    ]);
    const branchIds = [...new Set((leaders ?? []).map((l) => l.members?.branch_id).filter((id): id is string => Boolean(id)))];
    const { data: branches } = branchIds.length ? await admin.from("branches").select("id, country").in("id", branchIds) : { data: [] };
    const countryByBranch = new Map((branches ?? []).map((b) => [b.id, b.country]));

    for (const leader of leaders ?? []) {
      const member = leader.members;
      if (!member?.phone) continue;
      const country = resolvePhoneCountry(member.branch_id ? countryByBranch.get(member.branch_id) : null, org?.country);
      const phone = normalizePhoneNumber(member.phone, country);
      if (phone) phones.add(phone);
    }
  }
  return [...phones];
}

export async function sendStaffDigest(
  admin: AdminClient,
  automationId: string,
  organizationId: string,
  destination: AutomationDestination,
  celebrantsToday: { name: string; occasionLabel: string }[],
  now: Date = new Date(),
): Promise<boolean> {
  if (celebrantsToday.length === 0) return false;
  if (!destination.digest_template_id) return false;

  const template = await fetchApprovedTemplate(admin, destination.digest_template_id);
  if (!template) return false;

  const recipientPhones = await resolveDigestRecipientPhones(admin, destination, organizationId);
  if (recipientPhones.length === 0) {
    await logPlatformEvent({
      level: "warning",
      source: "automation_send",
      message: "Staff digest skipped: no leader with a usable phone number is selected.",
      organizationId,
      metadata: { automationId },
    });
    return false;
  }

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  const key = buildDigestIdempotencyKey(automationId, now, org?.timezone || DEFAULT_TIMEZONE);
  const { data: reserved } = await admin
    .from("automation_executions")
    .insert({
      organization_id: organizationId,
      automation_id: automationId,
      destination_kind: "staff_digest",
      idempotency_key: key,
      status: "sent",
      recipient_count: recipientPhones.length,
    })
    .select("id")
    .single();
  if (!reserved) return false;

  const celebrantList = buildCelebrantList(celebrantsToday);
  const bodyParams = resolveBodyParams(template.variable_names, { celebrant_list: celebrantList });

  const result = await sendBulkTemplateMessage({
    templateName: template.meta_template_name,
    languageCode: template.language,
    recipients: recipientPhones.map((phone) => ({ phone, bodyParams })),
    credentials: await getWhatsAppCredentials(organizationId),
  });

  const allFailed = result.failed.length === recipientPhones.length;
  if (allFailed) {
    const message = result.failed[0]?.error ?? "Digest send failed.";
    await admin.from("automation_executions").update({ status: "failed", error_message: message }).eq("id", reserved.id);
    await logPlatformEvent({ level: "error", source: "automation_send", message, organizationId, metadata: { automationId } });
  }
  return !allFailed;
}
