"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateMinistry, type MinistryFieldErrors } from "@/lib/ministries/validation";

const MINISTRIES_PATH = "/dashboard/ministries";

export interface MinistryFormState {
  error?: string;
  fieldErrors?: MinistryFieldErrors;
  success?: boolean;
}

function readMinistryFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? "").trim(),
    managedBy: String(formData.get("managedBy") ?? "").trim(),
    vision: String(formData.get("vision") ?? "").trim(),
    mission: String(formData.get("mission") ?? "").trim(),
    startedOn: String(formData.get("startedOn") ?? "").trim(),
    futurePlans: String(formData.get("futurePlans") ?? "").trim(),
  };
}

// updateMinistry/deleteMinistry forms only carry ministryId, not
// organizationId — looked up from the record itself before a permission
// check is possible.
async function organizationIdForMinistry(ministryId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("ministries").select("organization_id").eq("id", ministryId).maybeSingle();
  return data?.organization_id ?? null;
}

// Ministries are RLS-restricted to admins by default (see migration 0036)
// — the admin client performs the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it; the
// checkTabAccess call is what actually gates who gets here.
export async function createMinistry(
  _prevState: MinistryFormState,
  formData: FormData,
): Promise<MinistryFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "ministries", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { title, type, managedBy, vision, mission, startedOn, futurePlans } = readMinistryFields(formData);

  const fieldErrors = validateMinistry({ title });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("ministries").insert({
    organization_id: organizationId,
    title: title.trim(),
    type: type || null,
    managed_by: managedBy || null,
    vision: vision || null,
    mission: mission || null,
    started_on: startedOn || null,
    future_plans: futurePlans || null,
  });

  if (error) {
    return { error: "Couldn't add that ministry. You may not have permission to manage ministries." };
  }

  revalidatePath(MINISTRIES_PATH);
  return { success: true };
}

export async function updateMinistry(
  _prevState: MinistryFormState,
  formData: FormData,
): Promise<MinistryFormState> {
  await requireUser();

  const ministryId = String(formData.get("ministryId") ?? "");
  const organizationId = await organizationIdForMinistry(ministryId);
  if (!organizationId) {
    return { error: "That ministry could not be found." };
  }
  const access = await checkTabAccess(organizationId, "ministries", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { title, type, managedBy, vision, mission, startedOn, futurePlans } = readMinistryFields(formData);

  const fieldErrors = validateMinistry({ title });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ministries")
    .update({
      title: title.trim(),
      type: type || null,
      managed_by: managedBy || null,
      vision: vision || null,
      mission: mission || null,
      started_on: startedOn || null,
      future_plans: futurePlans || null,
    })
    .eq("id", ministryId);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage ministries." };
  }

  revalidatePath(MINISTRIES_PATH);
  return { success: true };
}

export async function deleteMinistry(formData: FormData) {
  await requireUser();
  const ministryId = String(formData.get("ministryId") ?? "");

  const organizationId = await organizationIdForMinistry(ministryId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "ministries", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("ministries").delete().eq("id", ministryId);

  revalidatePath(MINISTRIES_PATH);
}
