import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, checkAutomationQuota } from "@/lib/plans/dal";
import { validateVariableValues } from "@/lib/automations/template-mapping";
import { MAX_DIGEST_LEADERS } from "@/lib/automations/date-logic";
import type { AutomationBuiltInField, AutomationDateFieldSource, AutomationDestinationKind, AutomationStatus } from "@/types/database";

// The staff mobile app's Automations (birthday and anniversary messages): the
// same rules as the web's server actions (src/lib/automations/actions.ts), for a
// bearer-token caller. Who may do it was checked by the route. Member follow-up
// automations and WhatsApp template authoring stay on the web.

export type AutomationResult = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): AutomationResult => ({ ok: false, error });

export async function createAutomation(organizationId: string, userId: string, name: string): Promise<AutomationResult> {
  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) return fail(`Automation isn't included on the ${plan.name} plan.`);
  if (!name.trim()) return fail("Give this automation a name.");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("automations")
    .insert({ organization_id: organizationId, name: name.trim(), created_by: userId, updated_by: userId })
    .select("id")
    .single();
  return error || !data ? fail("Couldn't create that automation.") : { ok: true, id: data.id };
}

export async function updateAutomation(organizationId: string, userId: string, id: string, params: { name?: string; status?: string }): Promise<AutomationResult> {
  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) return fail(`Automation isn't included on the ${plan.name} plan.`);
  const admin = createAdminClient();

  const { data: existing } = await admin.from("automations").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!existing) return fail("That automation could not be found.");

  const status = params.status as AutomationStatus | undefined;
  if (status && !["draft", "active", "paused"].includes(status)) return fail("Invalid status.");

  if (status === "active") {
    // Activation runs under the database's per-org lock, so concurrent
    // activations can't push the church past its active limit.
    const { data: activated, error } = await admin.rpc("activate_automation_within_limit", { p_org: organizationId, p_automation: id, p_limit: plan.automationLimit });
    if (error) return fail("Couldn't activate that automation.");
    if (!activated) return fail((await checkAutomationQuota(organizationId)) ?? `Your ${plan.name} plan's active automation limit has been reached.`);
  }

  const update: { name?: string; status?: AutomationStatus; updated_by: string } = { updated_by: userId };
  if (params.name !== undefined) update.name = params.name.trim();
  if (status && status !== "active") update.status = status;
  if (update.name !== undefined || update.status !== undefined) {
    const { error } = await admin.from("automations").update(update).eq("id", id).eq("organization_id", organizationId);
    if (error) return fail("Couldn't update that automation.");
  }
  return { ok: true, id };
}

export async function deleteAutomation(organizationId: string, id: string): Promise<AutomationResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("automations").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't delete that automation.") : { ok: true };
}

export async function upsertTrigger(
  organizationId: string,
  f: {
    id?: string;
    automationId: string;
    dateFieldSource: AutomationDateFieldSource;
    builtInField?: AutomationBuiltInField | null;
    dateFieldId?: string | null;
    occasionLabel: string;
    daysOffset: number;
    templateId?: string | null;
    variableValues?: Record<string, string>;
    isActive: boolean;
  },
): Promise<AutomationResult> {
  if (!f.occasionLabel.trim()) return fail('Give this occasion a label (e.g. "Birthday").');
  if (f.dateFieldSource === "built_in" && !f.builtInField) return fail("Select a date field.");
  if (f.dateFieldSource === "custom_field" && !f.dateFieldId) return fail("Select a date field.");
  if (!Number.isInteger(f.daysOffset) || f.daysOffset < -30 || f.daysOffset > 30) return fail("Choose a day between 30 days before and 30 days after.");

  const variableValues = f.templateId ? f.variableValues ?? {} : {};
  const variableError = validateVariableValues(variableValues);
  if (variableError) return fail(variableError);

  const admin = createAdminClient();
  const { data: automation } = await admin.from("automations").select("id").eq("id", f.automationId).eq("organization_id", organizationId).maybeSingle();
  if (!automation) return fail("That automation could not be found.");
  if (f.templateId) {
    const { data: template } = await admin.from("automation_templates").select("id").eq("id", f.templateId).eq("organization_id", organizationId).maybeSingle();
    if (!template) return fail("That template could not be found.");
  }
  if (f.dateFieldSource === "custom_field" && f.dateFieldId) {
    const { data: field } = await admin.from("member_field_definitions").select("id").eq("id", f.dateFieldId).eq("organization_id", organizationId).maybeSingle();
    if (!field) return fail("That date field could not be found.");
  }

  const row = {
    automation_id: f.automationId,
    organization_id: organizationId,
    date_field_source: f.dateFieldSource,
    built_in_field: f.dateFieldSource === "built_in" ? f.builtInField : null,
    date_field_id: f.dateFieldSource === "custom_field" ? f.dateFieldId : null,
    occasion_label: f.occasionLabel.trim(),
    days_offset: f.daysOffset,
    template_id: f.templateId ?? null,
    variable_values: variableValues,
    is_active: f.isActive,
  };
  const { data, error } = f.id
    ? await admin.from("automation_triggers").update(row).eq("id", f.id).eq("organization_id", organizationId).select("id").single()
    : await admin.from("automation_triggers").insert(row).select("id").single();
  return error || !data ? fail("Couldn't save that trigger.") : { ok: true, id: data.id };
}

export async function deleteTrigger(organizationId: string, id: string): Promise<AutomationResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("automation_triggers").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that trigger.") : { ok: true };
}

export async function upsertDestination(
  organizationId: string,
  f: { automationId: string; kind: AutomationDestinationKind; isActive: boolean; recipientLeaderIds?: string[]; digestTemplateId?: string | null },
): Promise<AutomationResult> {
  const recipientLeaderIds = f.kind === "staff_digest" ? [...new Set(f.recipientLeaderIds ?? [])] : [];
  if (recipientLeaderIds.length > MAX_DIGEST_LEADERS) return fail(`Pick at most ${MAX_DIGEST_LEADERS} leaders.`);

  const admin = createAdminClient();
  const { data: automation } = await admin.from("automations").select("id").eq("id", f.automationId).eq("organization_id", organizationId).maybeSingle();
  if (!automation) return fail("That automation could not be found.");
  if (recipientLeaderIds.length > 0) {
    const { count } = await admin.from("leaders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("id", recipientLeaderIds);
    if (count !== recipientLeaderIds.length) return fail("One of the selected leaders no longer exists.");
  }
  if (f.kind === "staff_digest" && f.digestTemplateId) {
    const { data: template } = await admin.from("automation_templates").select("id").eq("id", f.digestTemplateId).eq("organization_id", organizationId).maybeSingle();
    if (!template) return fail("That template could not be found.");
  }

  const { data, error } = await admin
    .from("automation_destinations")
    .upsert(
      {
        automation_id: f.automationId,
        organization_id: organizationId,
        kind: f.kind,
        is_active: f.isActive,
        recipient_leader_ids: recipientLeaderIds,
        digest_template_id: f.kind === "staff_digest" ? f.digestTemplateId ?? null : null,
      },
      { onConflict: "automation_id,kind" },
    )
    .select("id")
    .single();
  return error || !data ? fail("Couldn't save that destination.") : { ok: true, id: data.id };
}
