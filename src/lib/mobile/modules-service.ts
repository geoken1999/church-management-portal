import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgFeatureState } from "@/lib/plans/dal";
import { getOrganizationTimezone } from "@/lib/organizations/org-timezone";
import { dateKeyInTimezone } from "@/lib/organizations/timezone";
import { requireFinancePlan } from "@/lib/finance/actions";
import { parseModuleInput, type ModuleSpec } from "@/lib/mobile/modules";

export type RecordResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): RecordResult => ({ ok: false, error });

// A reference field (a member, leader, branch or fundraiser) must belong to this
// church; the request is checked, not trusted.
async function referencesBelong(spec: ModuleSpec, organizationId: string, row: Record<string, unknown>): Promise<string | null> {
  const admin = createAdminClient();
  for (const field of spec.fields) {
    const value = row[field.column];
    if (typeof value !== "string" || !value) continue;
    if (field.type === "member") {
      const { data } = await admin.from("members").select("id").eq("id", value).eq("organization_id", organizationId).maybeSingle();
      if (!data) return `${field.label} could not be found.`;
    } else if (field.type === "leader") {
      const { data } = await admin.from("leaders").select("id").eq("member_id", value).eq("organization_id", organizationId).maybeSingle();
      if (!data) return `${field.label} must be one of your leaders.`;
    } else if (field.type === "branch") {
      const { data } = await admin.from("branches").select("id").eq("id", value).eq("organization_id", organizationId).maybeSingle();
      if (!data) return `${field.label} could not be found.`;
    } else if (field.type === "category") {
      const { data } = await admin.from("accounting_categories").select("id").eq("id", value).eq("organization_id", organizationId).maybeSingle();
      if (!data) return `${field.label} could not be found.`;
    } else if (field.type === "fundraiser") {
      const { data } = await admin.from("fundraisers").select("id").eq("id", value).eq("organization_id", organizationId).maybeSingle();
      if (!data) return `${field.label} could not be found.`;
    }
  }
  return null;
}

// The table is chosen by the module, so these writes use an untyped client.
const untyped = () => createAdminClient() as unknown as SupabaseClient;

async function financeGate(spec: ModuleSpec, organizationId: string): Promise<string | null> {
  return spec.finance ? await requireFinancePlan(organizationId) : null;
}

export async function createRecord(spec: ModuleSpec, organizationId: string, userId: string, input: Record<string, unknown>): Promise<RecordResult> {
  const planError = await financeGate(spec, organizationId);
  if (planError) return fail(planError);

  const todayKey = dateKeyInTimezone(new Date(), await getOrganizationTimezone(organizationId));
  const parsed = parseModuleInput(spec, input, "create", todayKey);
  if ("error" in parsed) return fail(parsed.error);
  const refError = await referencesBelong(spec, organizationId, parsed.row);
  if (refError) return fail(refError);

  const admin = untyped();
  const { featureCaps } = await getOrgFeatureState(organizationId);
  const cap = (featureCaps as Record<string, number | null | undefined>)[spec.tab] ?? null;
  if (cap !== null) {
    const { count } = await admin.from(spec.table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    if ((count ?? 0) >= cap) return fail(`This church's plan allows up to ${cap} ${spec.tab} entries. Remove one or contact us to raise the limit.`);
  }

  const row = { organization_id: organizationId, ...parsed.row, ...(spec.createdBy ? { [spec.createdBy]: userId } : {}) };
  const { error } = await admin.from(spec.table).insert(row);
  if (error) return fail(error.code === "23505" ? "That's already in the list." : "Couldn't save that. Please try again.");
  return { ok: true };
}

export async function updateRecord(spec: ModuleSpec, organizationId: string, id: string, input: Record<string, unknown>): Promise<RecordResult> {
  const planError = await financeGate(spec, organizationId);
  if (planError) return fail(planError);

  const todayKey = dateKeyInTimezone(new Date(), await getOrganizationTimezone(organizationId));
  const parsed = parseModuleInput(spec, input, "update", todayKey);
  if ("error" in parsed) return fail(parsed.error);
  const refError = await referencesBelong(spec, organizationId, parsed.row);
  if (refError) return fail(refError);

  const admin = untyped();
  const { error } = await admin.from(spec.table).update(parsed.row).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

export async function deleteRecord(spec: ModuleSpec, organizationId: string, id: string): Promise<RecordResult> {
  const planError = await financeGate(spec, organizationId);
  if (planError) return fail(planError);
  const admin = untyped();
  const { error } = await admin.from(spec.table).delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that.") : { ok: true };
}
