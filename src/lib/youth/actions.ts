"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { validateYouth, type YouthFieldErrors } from "@/lib/youth/validation";

const YOUTH_PATH = "/dashboard/youth";

export interface YouthFormState {
  error?: string;
  fieldErrors?: YouthFieldErrors;
  success?: boolean;
}

function readYouthFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? ""),
    grade: String(formData.get("grade") ?? "").trim(),
    guardianName: String(formData.get("guardianName") ?? "").trim(),
    guardianPhone: String(formData.get("guardianPhone") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createYouth(_prevState: YouthFormState, formData: FormData): Promise<YouthFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const { memberId, grade, guardianName, guardianPhone, notes } = readYouthFields(formData);

  const fieldErrors = validateYouth({ memberId });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("youths").insert({
    organization_id: organizationId,
    member_id: memberId,
    grade: grade || null,
    guardian_name: guardianName || null,
    guardian_phone: guardianPhone || null,
    notes: notes || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That member is already in the youth roster." };
    }
    return { error: "Couldn't add that youth. You may not have permission to manage youth." };
  }

  revalidatePath(YOUTH_PATH);
  return { success: true };
}

export async function updateYouth(_prevState: YouthFormState, formData: FormData): Promise<YouthFormState> {
  await requireUser();

  const youthId = String(formData.get("youthId") ?? "");
  const { grade, guardianName, guardianPhone, notes } = readYouthFields(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("youths")
    .update({
      grade: grade || null,
      guardian_name: guardianName || null,
      guardian_phone: guardianPhone || null,
      notes: notes || null,
    })
    .eq("id", youthId);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage youth." };
  }

  revalidatePath(YOUTH_PATH);
  return { success: true };
}

export async function deleteYouth(formData: FormData) {
  await requireUser();
  const youthId = String(formData.get("youthId") ?? "");

  const supabase = await createClient();
  await supabase.from("youths").delete().eq("id", youthId);

  revalidatePath(YOUTH_PATH);
}
