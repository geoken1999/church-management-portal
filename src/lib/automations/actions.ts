"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getPlanLimits, checkAutomationQuota } from "@/lib/plans/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AutomationDateFieldSource, AutomationBuiltInField, AutomationDestinationKind, AutomationStatus } from "@/types/database";

const AUTOMATIONS_PATH = "/dashboard/automations";

export interface AutomationActionResult {
  error?: string;
  id?: string;
}

export async function createAutomationAction(name: string): Promise<AutomationActionResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "automations", "write");
  if (!access.ok) return { error: access.message };

  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) return { error: `Automation isn't included on the ${plan.name} plan.` };

  // New automations start as drafts, which don't count against the active
  // limit. The limit is enforced when one is activated (updateAutomationAction).
  if (!name.trim()) return { error: "Give this automation a name." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("automations")
    .insert({ organization_id: organizationId, name: name.trim(), created_by: user.id, updated_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't create that automation." };

  revalidatePath(AUTOMATIONS_PATH);
  return { id: data.id };
}

export async function updateAutomationAction(params: { id: string; name?: string; status?: AutomationStatus }): Promise<AutomationActionResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "automations", "write");
  if (!access.ok) return { error: access.message };

  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) return { error: `Automation isn't included on the ${plan.name} plan.` };

  const admin = createAdminClient();

  if (params.status === "active") {
    // Activation runs under the database's per-org lock (migration 0110), so
    // concurrent activations can't push the org past its active limit.
    const { data: activated, error: activateError } = await admin.rpc("activate_automation_within_limit", {
      p_org: organizationId,
      p_automation: params.id,
      p_limit: plan.automationLimit,
    });
    if (activateError) return { error: "Couldn't activate that automation." };
    if (!activated) {
      const quotaError = await checkAutomationQuota(organizationId);
      return { error: quotaError ?? `Your ${plan.name} plan's active automation limit has been reached.` };
    }
  }

  const update: { name?: string; status?: AutomationStatus; updated_by: string } = { updated_by: user.id };
  if (params.name !== undefined) update.name = params.name.trim();
  if (params.status !== undefined && params.status !== "active") update.status = params.status;

  if (update.name !== undefined || update.status !== undefined) {
    const { error } = await admin.from("automations").update(update).eq("id", params.id).eq("organization_id", organizationId);
    if (error) return { error: "Couldn't update that automation." };
  }

  revalidatePath(AUTOMATIONS_PATH);
  return { id: params.id };
}

export async function deleteAutomationAction(id: string): Promise<AutomationActionResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "automations", "delete");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { error } = await admin.from("automations").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't delete that automation." };

  revalidatePath(AUTOMATIONS_PATH);
  return {};
}

export async function upsertAutomationTriggerAction(params: {
  id?: string;
  automationId: string;
  dateFieldSource: AutomationDateFieldSource;
  builtInField?: AutomationBuiltInField | null;
  dateFieldId?: string | null;
  occasionLabel: string;
  daysOffset: number;
  templateId?: string | null;
  isActive: boolean;
}): Promise<AutomationActionResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "automations", "write");
  if (!access.ok) return { error: access.message };

  if (!params.occasionLabel.trim()) return { error: "Give this occasion a label (e.g. \"Birthday\")." };
  if (params.dateFieldSource === "built_in" && !params.builtInField) return { error: "Select a date field." };
  if (params.dateFieldSource === "custom_field" && !params.dateFieldId) return { error: "Select a date field." };

  const admin = createAdminClient();
  const row = {
    automation_id: params.automationId,
    organization_id: organizationId,
    date_field_source: params.dateFieldSource,
    built_in_field: params.dateFieldSource === "built_in" ? params.builtInField : null,
    date_field_id: params.dateFieldSource === "custom_field" ? params.dateFieldId : null,
    occasion_label: params.occasionLabel.trim(),
    days_offset: params.daysOffset,
    template_id: params.templateId ?? null,
    is_active: params.isActive,
  };

  const { data, error } = params.id
    ? await admin.from("automation_triggers").update(row).eq("id", params.id).eq("organization_id", organizationId).select("id").single()
    : await admin.from("automation_triggers").insert(row).select("id").single();

  if (error || !data) return { error: "Couldn't save that trigger." };

  revalidatePath(AUTOMATIONS_PATH);
  return { id: data.id };
}

export async function deleteAutomationTriggerAction(id: string): Promise<AutomationActionResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "automations", "write");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { error } = await admin.from("automation_triggers").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't remove that trigger." };

  revalidatePath(AUTOMATIONS_PATH);
  return {};
}

export async function upsertAutomationDestinationAction(params: {
  automationId: string;
  kind: AutomationDestinationKind;
  isActive: boolean;
  recipientPhones?: string[];
  digestTemplateId?: string | null;
}): Promise<AutomationActionResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "automations", "write");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const row = {
    automation_id: params.automationId,
    organization_id: organizationId,
    kind: params.kind,
    is_active: params.isActive,
    recipient_phones: params.kind === "staff_digest" ? params.recipientPhones ?? [] : null,
    digest_template_id: params.kind === "staff_digest" ? params.digestTemplateId ?? null : null,
  };

  const { data, error } = await admin
    .from("automation_destinations")
    .upsert(row, { onConflict: "automation_id,kind" })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't save that destination." };

  revalidatePath(AUTOMATIONS_PATH);
  return { id: data.id };
}
