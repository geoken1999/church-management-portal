"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkStorageQuota } from "@/lib/plans/dal";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, documentExtension, validateDocumentTitle, validateCategoryName } from "@/lib/folder/validation";

const FOLDER_PATH = "/dashboard/folder";
// Just long enough for the browser to actually start the download/open the
// tab after the button click — not meant to be a durable link, so it's
// kept short rather than something a viewer could stash and reuse later.
const SIGNED_URL_EXPIRY_SECONDS = 60;

async function organizationIdForDocument(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("shared_documents").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

async function organizationIdForCategory(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("folder_categories").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export interface UploadDocumentState {
  error?: string;
  success?: boolean;
}

export async function uploadSharedDocument(
  _prevState: UploadDocumentState,
  formData: FormData,
): Promise<UploadDocumentState> {
  const user = await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "folder", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  const titleError = validateDocumentTitle(title);
  if (titleError) {
    return { error: titleError };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return { error: "That file type isn't supported." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: `File must be smaller than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.` };
  }

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) {
    return { error: quotaError };
  }

  const categoryIdRaw = String(formData.get("categoryId") ?? "");
  const categoryId = categoryIdRaw && categoryIdRaw !== "none" ? categoryIdRaw : null;
  if (categoryId && (await organizationIdForCategory(categoryId)) !== organizationId) {
    return { error: "That category could not be found." };
  }

  const documentId = crypto.randomUUID();
  const path = `${organizationId}/${documentId}${documentExtension(file.type)}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("shared-documents").upload(path, file, { contentType: file.type });

  if (uploadError) {
    // Logged (not shown to the uploader) so a real cause — e.g. migration
    // 0049 not yet applied, so the shared-documents bucket doesn't exist —
    // shows up in server logs instead of being indistinguishable from any
    // other upload failure.
    console.error("shared-documents upload failed:", uploadError.message);
    return { error: "Couldn't upload that file. Please try again." };
  }

  const { error: insertError } = await admin.from("shared_documents").insert({
    id: documentId,
    organization_id: organizationId,
    category_id: categoryId,
    title,
    file_path: path,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: user.id,
  });

  if (insertError) {
    console.error("shared_documents insert failed:", insertError.message);
    await admin.storage.from("shared-documents").remove([path]);
    return { error: "Couldn't save that document. Please try again." };
  }

  revalidatePath(FOLDER_PATH);
  return { success: true };
}

export async function deleteSharedDocument(formData: FormData) {
  await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  const path = String(formData.get("path") ?? "");

  const organizationId = await organizationIdForDocument(documentId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "folder", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  const { error } = await admin.from("shared_documents").delete().eq("id", documentId);
  if (!error && path) {
    await admin.storage.from("shared-documents").remove([path]);
  }

  revalidatePath(FOLDER_PATH);
}

export interface DownloadUrlState {
  error?: string;
  url?: string;
}

// Called directly from a client component's click handler (no <form>
// involved) — this is the *only* path that ever produces a working URL
// into the private shared-documents bucket, and it re-checks read access
// itself rather than trusting that the caller was allowed to see the
// document list in the first place.
export async function getFolderDownloadUrl(documentId: string): Promise<DownloadUrlState> {
  await requireUser();

  const organizationId = await organizationIdForDocument(documentId);
  if (!organizationId) {
    return { error: "That document could not be found." };
  }
  const access = await checkTabAccess(organizationId, "folder", "read");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();
  const { data: document } = await admin.from("shared_documents").select("file_path").eq("id", documentId).maybeSingle();
  if (!document) {
    return { error: "That document could not be found." };
  }

  const { data, error } = await admin.storage
    .from("shared-documents")
    .createSignedUrl(document.file_path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) {
    return { error: "Couldn't generate a download link. Please try again." };
  }

  return { url: data.signedUrl };
}

export interface CategoryState {
  error?: string;
  success?: boolean;
}

export async function createFolderCategory(_prevState: CategoryState, formData: FormData): Promise<CategoryState> {
  await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const access = await checkTabAccess(organizationId, "folder", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const name = String(formData.get("name") ?? "").trim();
  const nameError = validateCategoryName(name);
  if (nameError) {
    return { error: nameError };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("folder_categories").insert({ organization_id: organizationId, name });
  if (error) {
    if (error.code === "23505") {
      return { error: "A category with that name already exists." };
    }
    console.error("folder_categories insert failed:", error.message);
    return { error: "Couldn't create that category. Please try again." };
  }

  revalidatePath(FOLDER_PATH);
  return { success: true };
}

export async function deleteFolderCategory(formData: FormData) {
  await requireUser();
  const categoryId = String(formData.get("categoryId") ?? "");

  const organizationId = await organizationIdForCategory(categoryId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "folder", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("folder_categories").delete().eq("id", categoryId);

  revalidatePath(FOLDER_PATH);
}

// Called directly from the document card's category picker — reassigns
// which category (if any) a document belongs to, which also determines
// whether it appears under that category's share link.
export async function setDocumentCategory(documentId: string, categoryId: string | null): Promise<{ error?: string }> {
  await requireUser();

  const organizationId = await organizationIdForDocument(documentId);
  if (!organizationId) {
    return { error: "That document could not be found." };
  }
  const access = await checkTabAccess(organizationId, "folder", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  if (categoryId) {
    const categoryOrgId = await organizationIdForCategory(categoryId);
    if (categoryOrgId !== organizationId) {
      return { error: "That category could not be found." };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("shared_documents").update({ category_id: categoryId }).eq("id", documentId);
  if (error) {
    return { error: "Couldn't update the category. Please try again." };
  }

  revalidatePath(FOLDER_PATH);
  return {};
}

export interface ShareLinkState {
  error?: string;
  shareEnabled?: boolean;
}

// Toggles a single document's masked /share/file/{token} link on or
// off. Turning it off immediately breaks the old link — a leaked link is
// revoked by disabling, not by leaving it live forever.
export async function toggleDocumentShare(documentId: string, enabled: boolean): Promise<ShareLinkState> {
  await requireUser();

  const organizationId = await organizationIdForDocument(documentId);
  if (!organizationId) {
    return { error: "That document could not be found." };
  }
  const access = await checkTabAccess(organizationId, "folder", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("shared_documents").update({ share_enabled: enabled }).eq("id", documentId);
  if (error) {
    return { error: "Couldn't update the share link. Please try again." };
  }

  revalidatePath(FOLDER_PATH);
  return { shareEnabled: enabled };
}

// Toggles a category's masked /share/folder/{token} link — while enabled,
// it lists and allows downloading every document assigned to that category.
export async function toggleCategoryShare(categoryId: string, enabled: boolean): Promise<ShareLinkState> {
  await requireUser();

  const organizationId = await organizationIdForCategory(categoryId);
  if (!organizationId) {
    return { error: "That category could not be found." };
  }
  const access = await checkTabAccess(organizationId, "folder", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("folder_categories").update({ share_enabled: enabled }).eq("id", categoryId);
  if (error) {
    return { error: "Couldn't update the share link. Please try again." };
  }

  revalidatePath(FOLDER_PATH);
  return { shareEnabled: enabled };
}
