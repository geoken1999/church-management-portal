import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkStorageQuota } from "@/lib/plans/dal";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, documentExtension, validateCategoryName, validateDocumentTitle } from "@/lib/folder/validation";

// The staff mobile app's Documents changes: the same rules as the web's server
// actions (src/lib/folder/actions.ts), for a bearer-token caller. Who may do it
// was checked by the route. A phone can't push a big file through a serverless
// request, so an upload is two steps: ask for a signed upload ticket, send the
// file straight to storage, then confirm it here (the size is re-checked from
// what actually landed in storage).

const BUCKET = "shared-documents";
const SIGNED_URL_EXPIRY_SECONDS = 60;

export type FolderResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
const fail = (error: string): FolderResult => ({ ok: false, error });

async function categoryBelongs(organizationId: string, categoryId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("folder_categories").select("id").eq("id", categoryId).eq("organization_id", organizationId).maybeSingle();
  return Boolean(data);
}

function cleanCategory(raw: string): string | null {
  return raw && raw !== "none" ? raw : null;
}

export async function prepareUpload(
  organizationId: string,
  input: { title: string; mimeType: string; size: number; categoryId: string },
): Promise<FolderResult> {
  const titleError = validateDocumentTitle(input.title.trim());
  if (titleError) return fail(titleError);
  if (!ALLOWED_DOCUMENT_TYPES.includes(input.mimeType)) return fail("That file type isn't supported.");
  if (!(input.size > 0)) return fail("Choose a file to upload.");
  if (input.size > MAX_DOCUMENT_BYTES) return fail(`File must be smaller than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.`);
  const quotaError = await checkStorageQuota(organizationId, input.size);
  if (quotaError) return fail(quotaError);
  const categoryId = cleanCategory(input.categoryId);
  if (categoryId && !(await categoryBelongs(organizationId, categoryId))) return fail("That category could not be found.");

  const documentId = crypto.randomUUID();
  const path = `${organizationId}/${documentId}${documentExtension(input.mimeType)}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("shared-documents signed upload failed:", error?.message);
    return fail("Couldn't start the upload. Please try again.");
  }
  return { ok: true, documentId, path, token: data.token };
}

export async function finishUpload(
  organizationId: string,
  userId: string,
  input: { documentId: string; title: string; mimeType: string; categoryId: string },
): Promise<FolderResult> {
  const admin = createAdminClient();
  const path = `${organizationId}/${input.documentId}${documentExtension(input.mimeType)}`;

  // What actually landed in storage, not what the app said it would send.
  const { data: listing } = await admin.storage.from(BUCKET).list(organizationId, { search: input.documentId, limit: 5 });
  const stored = (listing ?? []).find((entry) => entry.name === `${input.documentId}${documentExtension(input.mimeType)}`);
  const size = Number((stored?.metadata as { size?: number } | null)?.size ?? 0);
  if (!stored || !(size > 0)) return fail("The file didn't finish uploading. Please try again.");

  const removeAndFail = async (message: string) => {
    await admin.storage.from(BUCKET).remove([path]);
    return fail(message);
  };
  if (size > MAX_DOCUMENT_BYTES) return removeAndFail(`File must be smaller than ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.`);
  const quotaError = await checkStorageQuota(organizationId, size);
  if (quotaError) return removeAndFail(quotaError);

  const categoryId = cleanCategory(input.categoryId);
  if (categoryId && !(await categoryBelongs(organizationId, categoryId))) return removeAndFail("That category could not be found.");

  const { error } = await admin.from("shared_documents").insert({
    id: input.documentId,
    organization_id: organizationId,
    category_id: categoryId,
    title: input.title.trim(),
    file_path: path,
    file_type: input.mimeType,
    file_size: size,
    uploaded_by: userId,
  });
  if (error) {
    console.error("shared_documents insert failed:", error.message);
    return removeAndFail("Couldn't save that document. Please try again.");
  }
  return { ok: true };
}

export async function deleteDocument(organizationId: string, id: string): Promise<FolderResult> {
  const admin = createAdminClient();
  const { data: document } = await admin.from("shared_documents").select("file_path").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!document) return fail("That document could not be found.");
  const { error } = await admin.from("shared_documents").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return fail("Couldn't delete that document.");
  await admin.storage.from(BUCKET).remove([document.file_path]);
  return { ok: true };
}

export async function downloadUrl(organizationId: string, id: string): Promise<FolderResult> {
  const admin = createAdminClient();
  const { data: document } = await admin.from("shared_documents").select("file_path").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!document) return fail("That document could not be found.");
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(document.file_path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) return fail("Couldn't generate a download link. Please try again.");
  return { ok: true, url: data.signedUrl };
}

export async function setCategory(organizationId: string, id: string, categoryRaw: string): Promise<FolderResult> {
  const categoryId = cleanCategory(categoryRaw);
  if (categoryId && !(await categoryBelongs(organizationId, categoryId))) return fail("That category could not be found.");
  const admin = createAdminClient();
  const { error } = await admin.from("shared_documents").update({ category_id: categoryId }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't update the category. Please try again.") : { ok: true };
}

export async function toggleDocumentShareForMobile(organizationId: string, id: string, enabled: boolean): Promise<FolderResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("shared_documents").update({ share_enabled: enabled }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't update the share link. Please try again.") : { ok: true, shareEnabled: enabled };
}

export async function createCategory(organizationId: string, nameRaw: string): Promise<FolderResult> {
  const name = nameRaw.trim();
  const nameError = validateCategoryName(name);
  if (nameError) return fail(nameError);
  const admin = createAdminClient();
  const { error } = await admin.from("folder_categories").insert({ organization_id: organizationId, name });
  if (error) return fail(error.code === "23505" ? "A category with that name already exists." : "Couldn't create that category. Please try again.");
  return { ok: true };
}

export async function deleteCategory(organizationId: string, id: string): Promise<FolderResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("folder_categories").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't delete that category.") : { ok: true };
}

export async function toggleCategoryShareForMobile(organizationId: string, id: string, enabled: boolean): Promise<FolderResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("folder_categories").update({ share_enabled: enabled }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't update the share link. Please try again.") : { ok: true, shareEnabled: enabled };
}
