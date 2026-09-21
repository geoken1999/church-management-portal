"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
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

export async function createBranch(
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const { name, location, memberCount, managedBy, country } = readBranchFields(formData);

  const fieldErrors = validateBranch({ name, memberCount });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
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
  const { name, location, memberCount, managedBy, country } = readBranchFields(formData);

  const fieldErrors = validateBranch({ name, memberCount });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
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

  const supabase = await createClient();
  await supabase.from("branches").delete().eq("id", branchId);

  revalidatePath("/dashboard/branches");
}
