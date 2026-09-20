"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import {
  validateFieldDefinition,
  validateMemberBasics,
  parseCustomFieldValues,
  parseOptionsText,
  slugifyFieldKey,
  FIELD_TYPE_OPTIONS,
  type FieldDefinitionErrors,
  type MemberFieldErrors,
} from "@/lib/members/validation";
import type { MemberFieldDefinition, MemberFieldType, MemberStatus } from "@/types/database";

const MEMBER_STATUSES: MemberStatus[] = ["active", "left"];

function readMemberStatus(formData: FormData): MemberStatus {
  const raw = String(formData.get("status") ?? "active");
  return MEMBER_STATUSES.includes(raw as MemberStatus) ? (raw as MemberStatus) : "active";
}

function readBranchId(formData: FormData): string | null {
  const raw = String(formData.get("branchId") ?? "").trim();
  return raw || null;
}

// ---------------------------------------------------------------------------
// Field definitions (admin-only — the "customize the form" part)
// ---------------------------------------------------------------------------

export interface FieldDefinitionState {
  error?: string;
  fieldErrors?: FieldDefinitionErrors;
  success?: boolean;
}

const FIELD_TYPES = FIELD_TYPE_OPTIONS.map((o) => o.value);

// Backfills a required field's default onto existing members that don't
// have a value for it yet — the RPC only touches rows missing the key, so
// this is always safe to call even when nothing actually needs filling in.
async function backfillRequiredFieldDefault(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  definition: MemberFieldDefinition,
  rawDefault: string,
) {
  if (!definition.required || !rawDefault.trim()) return;

  const { values } = parseCustomFieldValues([definition], () => rawDefault);
  await supabase.rpc("backfill_member_custom_field", {
    p_organization_id: organizationId,
    p_key: definition.key,
    p_value: values[definition.key] ?? null,
  });
}

export async function createFieldDefinition(
  _prevState: FieldDefinitionState,
  formData: FormData,
): Promise<FieldDefinitionState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const label = String(formData.get("label") ?? "");
  const fieldType = String(formData.get("fieldType") ?? "");
  const required = formData.get("required") === "on";
  const options = parseOptionsText(String(formData.get("options") ?? ""));
  const existingDefault = String(formData.get("existingDefault") ?? "");

  const fieldErrors = validateFieldDefinition({ label, fieldType, options });
  if (!FIELD_TYPES.includes(fieldType as MemberFieldType)) {
    fieldErrors.label = fieldErrors.label ?? "Select a field type.";
  }
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("member_field_definitions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  const baseKey = slugifyFieldKey(label) || "field";

  for (let attempt = 0; attempt < 3; attempt++) {
    const key = attempt === 0 ? baseKey : `${baseKey}_${attempt + 1}`;
    const definition: MemberFieldDefinition = {
      id: "",
      organization_id: organizationId,
      key,
      label: label.trim(),
      field_type: fieldType as MemberFieldType,
      options: fieldType === "select" ? options : null,
      required,
      sort_order: count ?? 0,
      created_at: "",
      updated_at: "",
    };
    const { error } = await supabase.from("member_field_definitions").insert(definition);

    if (!error) {
      await backfillRequiredFieldDefault(supabase, organizationId, definition, existingDefault);
      revalidatePath("/dashboard/members");
      return { success: true };
    }

    if (!error.message.toLowerCase().includes("duplicate") && !error.message.includes("unique")) {
      return { error: "Couldn't add that field. You may not have permission to customize the form." };
    }
  }

  return { error: "Couldn't add that field. Try a different label." };
}

export async function updateFieldDefinition(
  _prevState: FieldDefinitionState,
  formData: FormData,
): Promise<FieldDefinitionState> {
  await requireUser();

  const fieldId = String(formData.get("fieldId") ?? "");
  const label = String(formData.get("label") ?? "");
  const fieldType = String(formData.get("fieldType") ?? "");
  const required = formData.get("required") === "on";
  const options = parseOptionsText(String(formData.get("options") ?? ""));
  const existingDefault = String(formData.get("existingDefault") ?? "");

  const fieldErrors = validateFieldDefinition({ label, fieldType, options });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("member_field_definitions")
    .update({
      label: label.trim(),
      options: fieldType === "select" ? options : null,
      required,
    })
    .eq("id", fieldId)
    .select()
    .single();

  if (error || !updated) {
    return { error: "Couldn't save that field. You may not have permission to customize the form." };
  }

  await backfillRequiredFieldDefault(supabase, updated.organization_id, updated, existingDefault);

  revalidatePath("/dashboard/members");
  return { success: true };
}

export async function deleteFieldDefinition(formData: FormData) {
  await requireUser();
  const fieldId = String(formData.get("fieldId") ?? "");

  const supabase = await createClient();
  await supabase.from("member_field_definitions").delete().eq("id", fieldId);

  revalidatePath("/dashboard/members");
}

// ---------------------------------------------------------------------------
// Member records
// ---------------------------------------------------------------------------

export interface MemberFormState {
  error?: string;
  fieldErrors?: MemberFieldErrors;
  success?: boolean;
}

export async function createMember(
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const basicErrors = validateMemberBasics({ firstName, lastName, email, phone });

  const supabase = await createClient();
  const { data: definitions } = await supabase
    .from("member_field_definitions")
    .select("*")
    .eq("organization_id", organizationId);

  const { values, errors: customErrors } = parseCustomFieldValues(definitions ?? [], (key) =>
    String(formData.get(`custom_${key}`) ?? ""),
  );

  const fieldErrors: MemberFieldErrors = { ...basicErrors };
  if (Object.keys(customErrors).length > 0) fieldErrors.custom = customErrors;

  if (Object.values(basicErrors).some(Boolean) || Object.keys(customErrors).length > 0) {
    return { fieldErrors };
  }

  const { error } = await supabase.from("members").insert({
    organization_id: organizationId,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email || null,
    phone: phone || null,
    status: readMemberStatus(formData),
    branch_id: readBranchId(formData),
    custom_fields: values,
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't add that member. Please try again." };
  }

  revalidatePath("/dashboard/members");
  return { success: true };
}

export async function updateMember(
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  await requireUser();
  const memberId = String(formData.get("memberId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const basicErrors = validateMemberBasics({ firstName, lastName, email, phone });

  const supabase = await createClient();
  const { data: definitions } = await supabase
    .from("member_field_definitions")
    .select("*")
    .eq("organization_id", organizationId);

  const { values, errors: customErrors } = parseCustomFieldValues(definitions ?? [], (key) =>
    String(formData.get(`custom_${key}`) ?? ""),
  );

  const fieldErrors: MemberFieldErrors = { ...basicErrors };
  if (Object.keys(customErrors).length > 0) fieldErrors.custom = customErrors;

  if (Object.values(basicErrors).some(Boolean) || Object.keys(customErrors).length > 0) {
    return { fieldErrors };
  }

  const { error } = await supabase
    .from("members")
    .update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email || null,
      phone: phone || null,
      status: readMemberStatus(formData),
      branch_id: readBranchId(formData),
      custom_fields: values,
    })
    .eq("id", memberId);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath("/dashboard/members");
  return { success: true };
}

export async function deleteMember(formData: FormData) {
  await requireUser();
  const memberId = String(formData.get("memberId") ?? "");

  const supabase = await createClient();
  await supabase.from("members").delete().eq("id", memberId);

  revalidatePath("/dashboard/members");
}

// Approves a pending public join request. Rejecting one is just deleteMember
// — there's no distinct "rejected" status to keep the enum small.
export async function approveMember(formData: FormData) {
  await requireUser();
  const memberId = String(formData.get("memberId") ?? "");

  const supabase = await createClient();
  await supabase.from("members").update({ status: "active" }).eq("id", memberId);

  revalidatePath("/dashboard/members");
}

// ---------------------------------------------------------------------------
// Bulk actions (admin-only, enforced both by RLS and by the UI only showing
// these controls to admins)
// ---------------------------------------------------------------------------

function readMemberIds(formData: FormData): string[] {
  return formData.getAll("memberIds").map(String).filter(Boolean);
}

export async function bulkUpdateMemberStatus(formData: FormData) {
  await requireUser();
  const memberIds = readMemberIds(formData);
  const status = readMemberStatus(formData);
  if (memberIds.length === 0) return;

  const supabase = await createClient();
  await supabase.from("members").update({ status }).in("id", memberIds);

  revalidatePath("/dashboard/members");
}

export async function bulkDeleteMembers(formData: FormData) {
  await requireUser();
  const memberIds = readMemberIds(formData);
  if (memberIds.length === 0) return;

  const supabase = await createClient();
  // RLS restricts this to admins; a non-admin's request simply deletes
  // nothing rather than erroring.
  await supabase.from("members").delete().in("id", memberIds);

  revalidatePath("/dashboard/members");
}
