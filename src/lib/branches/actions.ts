"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateBranch, type BranchFieldErrors } from "@/lib/branches/validation";

export interface BranchFormState {
  error?: string;
  fieldErrors?: BranchFieldErrors;
  success?: boolean;
}

function readBranchFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    location: String(formData.get("location") ?? "").trim(),
    memberCount: String(formData.get("memberCount") ?? ""),
    managedBy: String(formData.get("managedBy") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
  };
}

// updateBranch/deleteBranch forms only carry branchId, not organizationId —
// looked up from the record itself before a permission check is possible.
async function organizationIdForBranch(branchId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("branches").select("organization_id").eq("id", branchId).maybeSingle();
  return data?.organization_id ?? null;
}

// Branches are RLS-restricted to admins by default (see migration 0006) —
// the admin client is used for the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it; the
// checkTabAccess call just above is what actually gates who gets here.
export async function createBranch(
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "branches", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { name, location, memberCount, managedBy, country } = readBranchFields(formData);

  const fieldErrors = validateBranch({ name, memberCount });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("branches").insert({
    organization_id: organizationId,
    name: name.trim(),
    location: location || null,
    member_count: memberCount.trim() ? Number(memberCount) : null,
    managed_by: managedBy || null,
    country: country || null,
  });

  if (error) {
    return { error: "Couldn't add that branch. You may not have permission to manage branches." };
  }

  revalidatePath("/dashboard/branches");
  return { success: true };
}

export async function updateBranch(
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  await requireUser();

  const branchId = String(formData.get("branchId") ?? "");
  const organizationId = await organizationIdForBranch(branchId);
  if (!organizationId) {
    return { error: "That branch could not be found." };
  }
  const access = await checkTabAccess(organizationId, "branches", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { name, location, memberCount, managedBy, country } = readBranchFields(formData);

  const fieldErrors = validateBranch({ name, memberCount });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("branches")
    .update({
      name: name.trim(),
      location: location || null,
      member_count: memberCount.trim() ? Number(memberCount) : null,
      managed_by: managedBy || null,
      country: country || null,
    })
    .eq("id", branchId);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage branches." };
  }

  revalidatePath("/dashboard/branches");
  return { success: true };
}

export async function deleteBranch(formData: FormData) {
  await requireUser();
  const branchId = String(formData.get("branchId") ?? "");

  const organizationId = await organizationIdForBranch(branchId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "branches", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("branches").delete().eq("id", branchId);

  revalidatePath("/dashboard/branches");
}
