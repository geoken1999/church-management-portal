"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import {
  validateMediaTeamMember,
  validateMediaEquipment,
  validateMediaSocialAccount,
  ALLOWED_MEDIA_DOCUMENT_TYPES,
  MAX_MEDIA_DOCUMENT_BYTES,
  mediaDocumentExtension,
  type MediaTeamMemberFieldErrors,
  type MediaEquipmentFieldErrors,
  type MediaSocialAccountFieldErrors,
} from "@/lib/media/validation";
import { checkStorageQuota } from "@/lib/plans/dal";

const MEDIA_PATH = "/dashboard/media";

// Forms identifying an existing row only carry its id, not organizationId —
// looked up from the record itself before a permission check is possible.
// Media's three sub-tables (team/equipment/social) plus documents are all
// RLS-restricted to admins by default (see migrations 0014, 0033); the
// admin client performs the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it — the
// checkTabAccess call is what actually gates who gets here.
async function organizationIdForRow(
  table: "media_team_members" | "media_equipment" | "media_social_accounts" | "media_documents",
  id: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from(table).select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Media team
// ---------------------------------------------------------------------------

export interface MediaTeamMemberFormState {
  error?: string;
  fieldErrors?: MediaTeamMemberFieldErrors;
  success?: boolean;
}

function readTeamMemberFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? ""),
    role: String(formData.get("role") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createMediaTeamMember(
  _prevState: MediaTeamMemberFormState,
  formData: FormData,
): Promise<MediaTeamMemberFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, role, notes } = readTeamMemberFields(formData);

  const fieldErrors = validateMediaTeamMember({ memberId, role });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("media_team_members").insert({
    organization_id: organizationId,
    member_id: memberId,
    role: role.trim(),
    notes: notes || null,
  });

  if (error) {
    return { error: "Couldn't add that team member. You may not have permission to manage media." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function updateMediaTeamMember(
  _prevState: MediaTeamMemberFormState,
  formData: FormData,
): Promise<MediaTeamMemberFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForRow("media_team_members", id);
  if (!organizationId) {
    return { error: "That team member could not be found." };
  }
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { memberId, role, notes } = readTeamMemberFields(formData);

  const fieldErrors = validateMediaTeamMember({ memberId, role });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("media_team_members")
    .update({ member_id: memberId, role: role.trim(), notes: notes || null })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage media." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function deleteMediaTeamMember(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("media_team_members", id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "media", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("media_team_members").delete().eq("id", id);

  revalidatePath(MEDIA_PATH);
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export interface MediaEquipmentFormState {
  error?: string;
  fieldErrors?: MediaEquipmentFieldErrors;
  success?: boolean;
}

function readEquipmentFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    managedBy: String(formData.get("managedBy") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createMediaEquipment(
  _prevState: MediaEquipmentFormState,
  formData: FormData,
): Promise<MediaEquipmentFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { name, managedBy, notes } = readEquipmentFields(formData);

  const fieldErrors = validateMediaEquipment({ name });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("media_equipment").insert({
    organization_id: organizationId,
    name: name.trim(),
    managed_by: managedBy || null,
    notes: notes || null,
  });

  if (error) {
    return { error: "Couldn't add that equipment. You may not have permission to manage media." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function updateMediaEquipment(
  _prevState: MediaEquipmentFormState,
  formData: FormData,
): Promise<MediaEquipmentFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForRow("media_equipment", id);
  if (!organizationId) {
    return { error: "That equipment record could not be found." };
  }
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { name, managedBy, notes } = readEquipmentFields(formData);

  const fieldErrors = validateMediaEquipment({ name });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("media_equipment")
    .update({ name: name.trim(), managed_by: managedBy || null, notes: notes || null })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage media." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function deleteMediaEquipment(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("media_equipment", id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "media", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("media_equipment").delete().eq("id", id);

  revalidatePath(MEDIA_PATH);
}

// ---------------------------------------------------------------------------
// Social accounts
// ---------------------------------------------------------------------------

export interface MediaSocialAccountFormState {
  error?: string;
  fieldErrors?: MediaSocialAccountFieldErrors;
  success?: boolean;
}

function readSocialAccountFields(formData: FormData) {
  return {
    platform: String(formData.get("platform") ?? ""),
    handle: String(formData.get("handle") ?? "").trim(),
    managedBy: String(formData.get("managedBy") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createMediaSocialAccount(
  _prevState: MediaSocialAccountFormState,
  formData: FormData,
): Promise<MediaSocialAccountFormState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { platform, handle, managedBy, notes } = readSocialAccountFields(formData);

  const fieldErrors = validateMediaSocialAccount({ platform });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("media_social_accounts").insert({
    organization_id: organizationId,
    platform: platform.trim(),
    handle: handle || null,
    managed_by: managedBy || null,
    notes: notes || null,
  });

  if (error) {
    return { error: "Couldn't add that account. You may not have permission to manage media." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function updateMediaSocialAccount(
  _prevState: MediaSocialAccountFormState,
  formData: FormData,
): Promise<MediaSocialAccountFormState> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const organizationId = await organizationIdForRow("media_social_accounts", id);
  if (!organizationId) {
    return { error: "That account could not be found." };
  }
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const { platform, handle, managedBy, notes } = readSocialAccountFields(formData);

  const fieldErrors = validateMediaSocialAccount({ platform });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("media_social_accounts")
    .update({ platform: platform.trim(), handle: handle || null, managed_by: managedBy || null, notes: notes || null })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. You may not have permission to manage media." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function deleteMediaSocialAccount(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("media_social_accounts", id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "media", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("media_social_accounts").delete().eq("id", id);

  revalidatePath(MEDIA_PATH);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface MediaDocumentFormState {
  error?: string;
  success?: boolean;
}

export async function uploadMediaDocument(
  _prevState: MediaDocumentFormState,
  formData: FormData,
): Promise<MediaDocumentFormState> {
  const user = await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "media", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!title || title.length < 2) {
    return { error: "Give the document a title of at least 2 characters." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (!ALLOWED_MEDIA_DOCUMENT_TYPES.includes(file.type)) {
    return { error: "That file type isn't supported." };
  }
  if (file.size > MAX_MEDIA_DOCUMENT_BYTES) {
    return { error: `File must be smaller than ${Math.round(MAX_MEDIA_DOCUMENT_BYTES / (1024 * 1024))}MB.` };
  }

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) {
    return { error: quotaError };
  }

  const documentId = crypto.randomUUID();
  const path = `${organizationId}/${documentId}${mediaDocumentExtension(file.type)}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("media-documents")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { error: "Couldn't upload that file. You may not have permission to manage media." };
  }

  const { error: insertError } = await admin.from("media_documents").insert({
    id: documentId,
    organization_id: organizationId,
    title,
    file_path: path,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: user.id,
  });

  if (insertError) {
    await admin.storage.from("media-documents").remove([path]);
    return { error: "Couldn't save that document. Please try again." };
  }

  revalidatePath(MEDIA_PATH);
  return { success: true };
}

export async function deleteMediaDocument(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const path = String(formData.get("path") ?? "");

  const organizationId = await organizationIdForRow("media_documents", id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "media", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  const { error } = await admin.from("media_documents").delete().eq("id", id);
  if (!error && path) {
    await admin.storage.from("media-documents").remove([path]);
  }

  revalidatePath(MEDIA_PATH);
}
