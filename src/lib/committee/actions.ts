"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateCommitteeMember, type CommitteeMemberFieldErrors } from "@/lib/committee/validation";

const COMMITTEE_PATH = "/dashboard/committee";

export interface CommitteeMemberFormState {
  error?: string;
  fieldErrors?: CommitteeMemberFieldErrors;
  success?: boolean;
}

function readCommitteeFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? ""),
    committeeName: String(formData.get("committeeName") ?? ""),
    role: String(formData.get("role") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

// Committee is RLS-restricted to admins by default (see migration 0047) —
// the admin client performs the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it; the
// checkTabAccess call is what actually gates who gets here.
async function organizationIdForCommitteeMember(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("committee_members").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function createCommitteeMember(
  _prevState: CommitteeMemberFormState,
  formData: FormData,
): Promise<CommitteeMemberFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "committee", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, committeeName, role, notes } = readCommitteeFields(formData);

  const fieldErrors = validateCommitteeMember({ memberId, committeeName, role });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("committee_members").insert({
    organization_id: organizationId,
    member_id: memberId,
    committee_name: committeeName.trim(),
    role: role.trim(),
    notes: notes || null,
  });

  if (error) {
    return { error: "Couldn't add that committee member. You may not have permission to manage the committee." };
  }

  revalidatePath(COMMITTEE_PATH);
  return { success: true };
}

export async function updateCommitteeMember(
  _prevState: CommitteeMemberFormState,
  formData: FormData,
): Promise<CommitteeMemberFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForCommitteeMember(id);
  if (!organizationId) {
    return { error: "That committee member could not be found." };
  }
  const access = await checkTabAccess(organizationId, "committee", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, committeeName, role, notes } = readCommitteeFields(formData);

  const fieldErrors = validateCommitteeMember({ memberId, committeeName, role });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("committee_members")
    .update({
      member_id: memberId,
      committee_name: committeeName.trim(),
      role: role.trim(),
      notes: notes || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage the committee." };
  }

  revalidatePath(COMMITTEE_PATH);
  return { success: true };
}

export async function deleteCommitteeMember(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForCommitteeMember(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "committee", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("committee_members").delete().eq("id", id);

  revalidatePath(COMMITTEE_PATH);
}
