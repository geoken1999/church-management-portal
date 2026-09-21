"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { validateLeader, type LeaderFieldErrors } from "@/lib/leaders/validation";

const LEADERS_PATH = "/dashboard/leaders";

export interface LeaderFormState {
  error?: string;
  fieldErrors?: LeaderFieldErrors;
  success?: boolean;
}

function readLeaderFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createLeader(_prevState: LeaderFormState, formData: FormData): Promise<LeaderFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const { memberId, title, notes } = readLeaderFields(formData);

  const fieldErrors = validateLeader({ memberId });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leaders").insert({
    organization_id: organizationId,
    member_id: memberId,
    title: title || null,
    notes: notes || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That member is already a leader." };
    }
    return { error: "Couldn't add that leader. You may not have permission to manage leaders." };
  }

  revalidatePath(LEADERS_PATH);
  return { success: true };
}

export async function updateLeader(_prevState: LeaderFormState, formData: FormData): Promise<LeaderFormState> {
  await requireUser();

  const leaderId = String(formData.get("leaderId") ?? "");
  const { title, notes } = readLeaderFields(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("leaders")
    .update({ title: title || null, notes: notes || null })
    .eq("id", leaderId);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage leaders." };
  }

  revalidatePath(LEADERS_PATH);
  return { success: true };
}

export async function deleteLeader(formData: FormData) {
  await requireUser();
  const leaderId = String(formData.get("leaderId") ?? "");

  const supabase = await createClient();
  await supabase.from("leaders").delete().eq("id", leaderId);

  revalidatePath(LEADERS_PATH);
}
