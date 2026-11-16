import "server-only";

import { friendlyDeliveryReason, isMarketingCategory } from "@/lib/whatsapp/contact-health";
import { getFallbackChannel, sendFallbackMessage } from "@/lib/whatsapp/fallback";
import { renderNamedTemplate } from "@/lib/whatsapp/template-render";
import { findBlockedRecipients, logOutboundMessages, senderKeyFor, splitBlocked } from "@/lib/whatsapp/message-log";
import { getWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateMessage, sendBulkTemplateMessage } from "@/lib/whatsapp/client";
import { normalizePhoneNumber, resolvePhoneCountry } from "@/lib/whatsapp/validation";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { resolveBodyParams, resolveVariableValues } from "@/lib/automations/template-mapping";
import { buildCelebrantList, buildDirectIdempotencyKey, buildDigestIdempotencyKey, buildWeeklyCelebrantList, buildWeeklyIdempotencyKey, todayInTimezone } from "@/lib/automations/date-logic";
import type { WeeklyEntry } from "@/lib/automations/date-logic";
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

  // A marketing template (a birthday greeting, say) isn't sent to someone
  // WhatsApp is currently refusing to deliver marketing to: it would only
  // fail again and count against this number's standing. The occasion is
  // recorded as skipped, with the reason, instead of silently dropped.
  const credentials = await getWhatsAppCredentials(trigger.organization_id);
  const senderKey = senderKeyFor(credentials);
  const blocked = isMarketingCategory(template.category) ? (await findBlockedRecipients(senderKey, [phone])).has(phone) : false;
  const messageText = renderNamedTemplate(
    template.body_text_named,
    resolveVariableValues(
      template.variable_names,
      {
        first_name: member.first_name,
        last_name: member.last_name,
        full_name: `${member.first_name} ${member.last_name}`.trim(),
        church_name: organizationName,
        occasion_label: occasionLabel,
      },
      trigger.variable_values,
    ),
  );

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
      status: blocked ? "skipped" : "sent",
      error_message: blocked ? friendlyDeliveryReason("131049") : null,
      recipient_count: 1,
    })
    .select("id")
    .single();
  if (!reserved) return; // unique violation -> already sent this occurrence
  if (blocked) {
    // WhatsApp won't take it: if the church chose a fallback, send the same
    // greeting by SMS or email instead of dropping it.
    const channel = await getFallbackChannel(trigger.organization_id);
    if (channel !== "none") {
      const result = await sendFallbackMessage({ organizationId: trigger.organization_id, channel, phone, text: messageText });
      if (result.ok) await admin.from("automation_executions").update({ error_message: `${friendlyDeliveryReason("131049")} Sent by ${channel} instead.` }).eq("id", reserved.id);
    }
    return;
  }

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
      credentials,
    });
    await admin.from("automation_executions").update({ meta_message_id: id }).eq("id", reserved.id);
    await logOutboundMessages([
      {
        organizationId: trigger.organization_id,
        kind: "automation",
        refId: reserved.id,
        recipient: phone,
        wamid: id,
        templateName: template.meta_template_name,
        category: template.category,
        senderKey,
        bodyText: messageText,
      },
    ]);
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

// Everything a staff message needs once the list is written: the approved template, who may be sent to right now, a claim on the idempotency
// key so a re-run never sends twice, then the send itself. Used by the daily digest and the weekly summary, which differ only in the
// template, the key and the list.
async function deliverStaffMessage(
  admin: AdminClient,
  params: {
    automationId: string;
    organizationId: string;
    destination: AutomationDestination;
    templateId: string;
    idempotencyKey: string;
    celebrantList: string;
    what: string;
  },
): Promise<boolean> {
  const { automationId, organizationId, destination, templateId, idempotencyKey, celebrantList, what } = params;

  const template = await fetchApprovedTemplate(admin, templateId);
  if (!template) return false;

  const credentials = await getWhatsAppCredentials(organizationId);
  const senderKey = senderKeyFor(credentials);
  const allPhones = await resolveDigestRecipientPhones(admin, destination, organizationId);
  // The same hold as for member messages: a marketing message isn't sent to a
  // leader WhatsApp is refusing marketing to. The next run tries again.
  const { sendable } = await splitBlocked(senderKey, isMarketingCategory(template.category), allPhones.map((phone) => ({ phone })));
  const recipientPhones = sendable.map((r) => r.phone);
  if (allPhones.length > 0 && recipientPhones.length === 0) {
    await logPlatformEvent({
      level: "info",
      source: "automation_send",
      message: `${what} not sent: WhatsApp is limiting marketing messages to every recipient right now.`,
      organizationId,
      metadata: { automationId },
    });
    return false;
  }
  if (recipientPhones.length === 0) {
    await logPlatformEvent({
      level: "warning",
      source: "automation_send",
      message: `${what} skipped: no leader with a usable phone number is selected.`,
      organizationId,
      metadata: { automationId },
    });
    return false;
  }

  const { data: reserved } = await admin
    .from("automation_executions")
    .insert({
      organization_id: organizationId,
      automation_id: automationId,
      destination_kind: "staff_digest",
      idempotency_key: idempotencyKey,
      status: "sent",
      recipient_count: recipientPhones.length,
    })
    .select("id")
    .single();
  if (!reserved) return false;

  const bodyParams = resolveBodyParams(template.variable_names, { celebrant_list: celebrantList });

  const result = await sendBulkTemplateMessage({
    templateName: template.meta_template_name,
    languageCode: template.language,
    recipients: recipientPhones.map((phone) => ({ phone, bodyParams })),
    credentials,
  });
  await logOutboundMessages(
    result.sentIds.map((sent) => ({
      organizationId,
      kind: "automation" as const,
      refId: reserved.id,
      recipient: sent.phone,
      wamid: sent.id,
      templateName: template.meta_template_name,
      category: template.category,
      senderKey,
      bodyText: renderNamedTemplate(template.body_text_named, { celebrant_list: celebrantList }),
    })),
  );

  const allFailed = result.failed.length === recipientPhones.length;
  if (allFailed) {
    const message = result.failed[0]?.error ?? `${what} send failed.`;
    await admin.from("automation_executions").update({ status: "failed", error_message: message }).eq("id", reserved.id);
    await logPlatformEvent({ level: "error", source: "automation_send", message, organizationId, metadata: { automationId } });
  }
  return !allFailed;
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

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return deliverStaffMessage(admin, {
    automationId,
    organizationId,
    destination,
    templateId: destination.digest_template_id,
    idempotencyKey: buildDigestIdempotencyKey(automationId, now, org?.timezone || DEFAULT_TIMEZONE),
    celebrantList: buildCelebrantList(celebrantsToday),
    what: "Staff digest",
  });
}

/**
 * The Sunday-morning summary: every special day in the week that starts today, in one WhatsApp message to the same leaders as the daily
 * digest, using the weekly template chosen for the destination. Nothing is sent for a week with no special days. Once per automation per
 * Sunday (a re-run the same day does nothing).
 */
export async function sendWeeklySpecialDaysDigest(
  admin: AdminClient,
  automationId: string,
  organizationId: string,
  destination: AutomationDestination,
  entries: WeeklyEntry[],
  now: Date = new Date(),
): Promise<boolean> {
  if (entries.length === 0) return false;
  if (!destination.weekly_template_id) return false;

  const { data: org } = await admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  const timeZone = org?.timezone || DEFAULT_TIMEZONE;
  return deliverStaffMessage(admin, {
    automationId,
    organizationId,
    destination,
    templateId: destination.weekly_template_id,
    idempotencyKey: buildWeeklyIdempotencyKey(automationId, now, timeZone),
    celebrantList: buildWeeklyCelebrantList(todayInTimezone(now, timeZone), entries),
    what: "Weekly special days summary",
  });
}
