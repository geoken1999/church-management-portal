"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import {
  validateWorshipTeamMember,
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  documentExtension,
  type WorshipTeamMemberFieldErrors,
} from "@/lib/worship/validation";
import { checkStorageQuota } from "@/lib/plans/dal";

const WORSHIP_PATH = "/dashboard/worship";

// ---------------------------------------------------------------------------
// Worship team
// ---------------------------------------------------------------------------

export interface WorshipTeamMemberFormState {
  error?: string;
  fieldErrors?: WorshipTeamMemberFieldErrors;
  success?: boolean;
}

function readTeamMemberFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? ""),
    role: String(formData.get("role") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

// Forms identifying an existing row only carry its id, not organizationId —
// looked up from the record itself before a permission check is possible.
async function organizationIdForRow(table: "worship_team_members" | "worship_documents", id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from(table).select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

// Worship team/documents are RLS-restricted to admins by default (see
// migration 0015) — the admin client performs the actual write so a
// "member" role granted write/delete via the tab permissions matrix can
// still perform it; the checkTabAccess call is what actually gates who
// gets here.
export async function createWorshipTeamMember(
  _prevState: WorshipTeamMemberFormState,
  formData: FormData,
): Promise<WorshipTeamMemberFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "worship", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, role, notes } = readTeamMemberFields(formData);

  const fieldErrors = validateWorshipTeamMember({ memberId, role });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("worship_team_members").insert({
    organization_id: organizationId,
    member_id: memberId,
    role: role.trim(),
    notes: notes || null,
  });

  if (error) {
    return { error: "Couldn't add that team member. You may not have permission to manage worship." };
  }

  revalidatePath(WORSHIP_PATH);
  return { success: true };
}

export async function updateWorshipTeamMember(
  _prevState: WorshipTeamMemberFormState,
  formData: FormData,
): Promise<WorshipTeamMemberFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForRow("worship_team_members", id);
  if (!organizationId) {
    return { error: "That team member could not be found." };
  }
  const access = await checkTabAccess(organizationId, "worship", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, role, notes } = readTeamMemberFields(formData);

  const fieldErrors = validateWorshipTeamMember({ memberId, role });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("worship_team_members")
    .update({ member_id: memberId, role: role.trim(), notes: notes || null })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage worship." };
  }

  revalidatePath(WORSHIP_PATH);
  return { success: true };
}

export async function deleteWorshipTeamMember(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("worship_team_members", id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "worship", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("worship_team_members").delete().eq("id", id);

  revalidatePath(WORSHIP_PATH);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface WorshipDocumentFormState {
  error?: string;
  success?: boolean;
}

export async function uploadWorshipDocument(
  _prevState: WorshipDocumentFormState,
  formData: FormData,
): Promise<WorshipDocumentFormState> {
  const user = await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "worship", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!title || title.length < 2) {
    return { error: "Give the document a title of at least 2 characters." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or PowerPoint file to upload." };
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return { error: "Only PDF and PowerPoint (.ppt/.pptx) files are supported." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: `File must be smaller than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.` };
  }

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) {
    return { error: quotaError };
  }

  // Generated up front (rather than letting the table default it) so the
  // storage object path is known before the row exists.
  const documentId = crypto.randomUUID();
  const path = `${organizationId}/${documentId}${documentExtension(file.type)}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("worship-documents")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { error: "Couldn't upload that file. You may not have permission to manage worship documents." };
  }

  const { error: insertError } = await admin.from("worship_documents").insert({
    id: documentId,
    organization_id: organizationId,
    title,
    file_path: path,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: user.id,
  });

  if (insertError) {
    await admin.storage.from("worship-documents").remove([path]);
    return { error: "Couldn't save that document. Please try again." };
  }

  revalidatePath(WORSHIP_PATH);
  return { success: true };
}

export async function deleteWorshipDocument(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const path = String(formData.get("path") ?? "");

  const organizationId = await organizationIdForRow("worship_documents", id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "worship", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  const { error } = await admin.from("worship_documents").delete().eq("id", id);
  if (!error && path) {
    await admin.storage.from("worship-documents").remove([path]);
  }

  revalidatePath(WORSHIP_PATH);
}
