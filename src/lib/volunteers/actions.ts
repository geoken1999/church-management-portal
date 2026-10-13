"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { parseVolunteerStatus, validateVolunteer, type VolunteerFieldErrors } from "@/lib/volunteers/validation";

const VOLUNTEERS_PATH = "/dashboard/volunteers";

export interface VolunteerFormState {
  error?: string;
  fieldErrors?: VolunteerFieldErrors;
  success?: boolean;
}

function readFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? ""),
    role: String(formData.get("role") ?? "").trim(),
    team: String(formData.get("team") ?? "").trim(),
    joinedOn: String(formData.get("joinedOn") ?? "").trim(),
    status: parseVolunteerStatus(String(formData.get("status") ?? "")),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

// Volunteers are admin-only by default in the database; the admin client does the
// write so a team member given Write access on the tab can too. checkTabAccess is what
// decides who gets here.
async function organizationIdForVolunteer(id: string): Promise<string | null> {
  const { data } = await createAdminClient().from("volunteers").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function createVolunteer(_prev: VolunteerFormState, formData: FormData): Promise<VolunteerFormState> {
  await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "volunteers", "write");
  if (!access.ok) return { error: access.message };

  const f = readFields(formData);
  const fieldErrors = validateVolunteer(f);
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors };

  const admin = createAdminClient();
  // The person must be a member of this church.
  const { data: member } = await admin.from("members").select("id").eq("id", f.memberId).eq("organization_id", organizationId).maybeSingle();
  if (!member) return { fieldErrors: { memberId: "That member could not be found." } };

  const { error } = await admin.from("volunteers").insert({
    organization_id: organizationId,
    member_id: f.memberId,
    role: f.role,
    team: f.team || null,
    joined_on: f.joinedOn || undefined,
    status: f.status,
    notes: f.notes || null,
  });
  if (error) {
    return { error: error.code === "23505" ? "That member is already a volunteer." : "Couldn't add that volunteer. Please try again." };
  }

  revalidatePath(VOLUNTEERS_PATH);
  return { success: true };
}

export async function updateVolunteer(_prev: VolunteerFormState, formData: FormData): Promise<VolunteerFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForVolunteer(id);
  if (!organizationId) return { error: "That volunteer could not be found." };
  const access = await checkTabAccess(organizationId, "volunteers", "write");
  if (!access.ok) return { error: access.message };

  const f = readFields(formData);
  const fieldErrors = validateVolunteer({ ...f, memberId: "x" });
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors };

  const { error } = await createAdminClient()
    .from("volunteers")
    .update({ role: f.role, team: f.team || null, joined_on: f.joinedOn || undefined, status: f.status, notes: f.notes || null })
    .eq("id", id);
  if (error) return { error: "Couldn't save those changes. Please try again." };

  revalidatePath(VOLUNTEERS_PATH);
  return { success: true };
}

export async function deleteVolunteer(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForVolunteer(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "volunteers", "delete");
  if (!access.ok) return;

  await createAdminClient().from("volunteers").delete().eq("id", id);
  revalidatePath(VOLUNTEERS_PATH);
}

// An admin verifies a volunteer (after checking their ID card), or removes the mark.
export async function setVolunteerVerified(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const verified = String(formData.get("verified") ?? "") === "true";
  const organizationId = await organizationIdForVolunteer(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "volunteers", "write");
  if (!access.ok) return;

  await createAdminClient()
    .from("volunteers")
    .update(verified ? { verified: true, verified_at: new Date().toISOString(), verified_by: user.id } : { verified: false, verified_at: null, verified_by: null })
    .eq("id", id);
  revalidatePath(VOLUNTEERS_PATH);
}
