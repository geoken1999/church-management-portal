"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
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

export async function createMinistry(
  _prevState: MinistryFormState,
  formData: FormData,
): Promise<MinistryFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const { title, type, managedBy, vision, mission, startedOn, futurePlans } = readMinistryFields(formData);

  const fieldErrors = validateMinistry({ title });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ministries").insert({
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
  const { title, type, managedBy, vision, mission, startedOn, futurePlans } = readMinistryFields(formData);

  const fieldErrors = validateMinistry({ title });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
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

  const supabase = await createClient();
  await supabase.from("ministries").delete().eq("id", ministryId);

  revalidatePath(MINISTRIES_PATH);
}
