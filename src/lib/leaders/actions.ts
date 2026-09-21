"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
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

// updateLeader/deleteLeader forms only carry leaderId, not organizationId —
// looked up from the record itself before a permission check is possible.
async function organizationIdForLeader(leaderId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("leaders").select("organization_id").eq("id", leaderId).maybeSingle();
  return data?.organization_id ?? null;
}

// Leaders are RLS-restricted to admins by default (see migration 0037) —
// the admin client performs the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it; the
// checkTabAccess call is what actually gates who gets here.
export async function createLeader(_prevState: LeaderFormState, formData: FormData): Promise<LeaderFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "leaders", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, title, notes } = readLeaderFields(formData);

  const fieldErrors = validateLeader({ memberId });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("leaders").insert({
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
  const organizationId = await organizationIdForLeader(leaderId);
  if (!organizationId) {
    return { error: "That leader could not be found." };
  }
  const access = await checkTabAccess(organizationId, "leaders", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { title, notes } = readLeaderFields(formData);

  const admin = createAdminClient();
  const { error } = await admin
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

  const organizationId = await organizationIdForLeader(leaderId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "leaders", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("leaders").delete().eq("id", leaderId);

  revalidatePath(LEADERS_PATH);
}
