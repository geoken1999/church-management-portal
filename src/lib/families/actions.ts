"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateFamily, validateFamilyMember, type FamilyFieldErrors, type FamilyMemberFieldErrors } from "@/lib/families/validation";

const FAMILIES_PATH = "/dashboard/families";

// Families is RLS-restricted to admins by default (see migration 0061) —
// the admin client performs the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it; the
// checkTabAccess call is what actually gates who gets here.
async function organizationIdForFamily(familyId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("families").select("organization_id").eq("id", familyId).maybeSingle();
  return data?.organization_id ?? null;
}

async function familyForFamilyMember(id: string): Promise<{ organizationId: string; familyId: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("family_members").select("organization_id, family_id").eq("id", id).maybeSingle();
  return data ? { organizationId: data.organization_id, familyId: data.family_id } : null;
}

export interface FamilyFormState {
  error?: string;
  fieldErrors?: FamilyFieldErrors;
  success?: boolean;
  familyId?: string;
}

export async function createFamily(_prevState: FamilyFormState, formData: FormData): Promise<FamilyFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const access = await checkTabAccess(organizationId, "families", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const name = String(formData.get("name") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors = validateFamily({ name });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("families")
    .insert({ organization_id: organizationId, name: name.trim(), notes: notes || null, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Couldn't create that family. Please try again." };
  }

  revalidatePath(FAMILIES_PATH);
  return { success: true, familyId: data.id };
}

export async function updateFamily(_prevState: FamilyFormState, formData: FormData): Promise<FamilyFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForFamily(id);
  if (!organizationId) {
    return { error: "That family could not be found." };
  }
  const access = await checkTabAccess(organizationId, "families", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const name = String(formData.get("name") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors = validateFamily({ name });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("families").update({ name: name.trim(), notes: notes || null }).eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(FAMILIES_PATH);
  return { success: true, familyId: id };
}

export async function deleteFamily(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForFamily(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "families", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  // Cascades to family_members (on delete cascade, see migration 0061) —
  // this removes the family and every member's assignment to it, not the
  // members themselves.
  await admin.from("families").delete().eq("id", id);

  revalidatePath(FAMILIES_PATH);
}

export interface FamilyMemberFormState {
  error?: string;
  fieldErrors?: FamilyMemberFieldErrors;
  success?: boolean;
}

export async function addFamilyMember(_prevState: FamilyMemberFormState, formData: FormData): Promise<FamilyMemberFormState> {
  await requireUser();

  const familyId = String(formData.get("familyId") ?? "");
  const organizationId = await organizationIdForFamily(familyId);
  if (!organizationId) {
    return { error: "That family could not be found." };
  }
  const access = await checkTabAccess(organizationId, "families", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const memberId = String(formData.get("memberId") ?? "");
  const relationship = String(formData.get("relationship") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors = validateFamilyMember({ memberId, relationship });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("family_members").insert({
    family_id: familyId,
    organization_id: organizationId,
    member_id: memberId,
    relationship: relationship.trim(),
    notes: notes || null,
  });

  if (error) {
    return {
      error: error.message.toLowerCase().includes("duplicate") ? "That member is already part of this family." : "Couldn't add that family member. Please try again.",
    };
  }

  revalidatePath(FAMILIES_PATH);
  return { success: true };
}

export async function updateFamilyMember(_prevState: FamilyMemberFormState, formData: FormData): Promise<FamilyMemberFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const context = await familyForFamilyMember(id);
  if (!context) {
    return { error: "That family member could not be found." };
  }
  const access = await checkTabAccess(context.organizationId, "families", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const memberId = String(formData.get("memberId") ?? "");
  const relationship = String(formData.get("relationship") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors = validateFamilyMember({ memberId, relationship });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("family_members")
    .update({ member_id: memberId, relationship: relationship.trim(), notes: notes || null })
    .eq("id", id);

  if (error) {
    return {
      error: error.message.toLowerCase().includes("duplicate") ? "That member is already part of this family." : "Couldn't save those changes. Please try again.",
    };
  }

  revalidatePath(FAMILIES_PATH);
  return { success: true };
}

export async function removeFamilyMember(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const context = await familyForFamilyMember(id);
  if (!context) return;
  const access = await checkTabAccess(context.organizationId, "families", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("family_members").delete().eq("id", id);

  revalidatePath(FAMILIES_PATH);
}
