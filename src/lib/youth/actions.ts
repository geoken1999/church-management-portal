"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
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

// updateYouth/deleteYouth forms only carry youthId, not organizationId —
// looked up from the record itself before a permission check is possible.
async function organizationIdForYouth(youthId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("youths").select("organization_id").eq("id", youthId).maybeSingle();
  return data?.organization_id ?? null;
}

// Youth records are RLS-restricted to admins by default (see migration
// 0038) — the admin client performs the actual write so a "member" role
// granted write/delete via the tab permissions matrix can still perform
// it; the checkTabAccess call is what actually gates who gets here.
export async function createYouth(_prevState: YouthFormState, formData: FormData): Promise<YouthFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "youth", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, grade, guardianName, guardianPhone, notes } = readYouthFields(formData);

  const fieldErrors = validateYouth({ memberId });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("youths").insert({
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
  const organizationId = await organizationIdForYouth(youthId);
  if (!organizationId) {
    return { error: "That youth record could not be found." };
  }
  const access = await checkTabAccess(organizationId, "youth", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { grade, guardianName, guardianPhone, notes } = readYouthFields(formData);

  const admin = createAdminClient();
  const { error } = await admin
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

  const organizationId = await organizationIdForYouth(youthId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "youth", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("youths").delete().eq("id", youthId);

  revalidatePath(YOUTH_PATH);
}
