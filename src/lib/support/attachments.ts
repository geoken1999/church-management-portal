import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORT_BUCKET, SUPPORT_IMAGE_TYPES, supportImagesProblem, type SupportAttachment } from "@/lib/support/images";

// Files from a form: the real ones only (an empty file input still sends an empty file).
export function imageFilesFrom(formData: FormData, field = "images"): File[] {
  return formData.getAll(field).filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

// Saves the screenshots for a ticket or reply. Returns what to store on the row, or why not.
export async function saveSupportImages(organizationId: string, files: File[]): Promise<{ attachments: SupportAttachment[] } | { error: string }> {
  const problem = supportImagesProblem(files);
  if (problem) return { error: problem };
  const admin = createAdminClient();
  const folder = crypto.randomUUID();
  const attachments: SupportAttachment[] = [];
  for (const file of files) {
    const path = `${organizationId}/${folder}/${crypto.randomUUID()}.${SUPPORT_IMAGE_TYPES[file.type]}`;
    const { error } = await admin.storage.from(SUPPORT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      if (attachments.length > 0) await admin.storage.from(SUPPORT_BUCKET).remove(attachments.map((a) => a.path));
      return { error: "Couldn't upload an image. Please try again." };
    }
    attachments.push({ path, name: file.name.slice(0, 120), size: file.size });
  }
  return { attachments };
}

export async function removeSupportFiles(paths: string[]): Promise<void> {
  if (paths.length > 0) await createAdminClient().storage.from(SUPPORT_BUCKET).remove(paths);
}

// Adds a short-lived link to every attachment of these rows, so they can be shown. Only
// called for rows the reader was already allowed to see.
export async function withSignedUrls<T extends { attachments?: SupportAttachment[] | null }>(rows: T[]): Promise<(Omit<T, "attachments"> & { attachments: SupportAttachment[] })[]> {
  const paths = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.path));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await createAdminClient().storage.from(SUPPORT_BUCKET).createSignedUrls(paths, 3600);
    for (const item of data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return rows.map((r) => ({ ...r, attachments: (r.attachments ?? []).map((a) => ({ ...a, url: urls.get(a.path) })) }));
}
