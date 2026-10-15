"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStorageQuota } from "@/lib/plans/dal";

const PATH = "/dashboard/mobile/popups";
const BUCKET = "app-popup-images";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export interface PopupInput {
  title: string;
  message: string;
  buttonLabel: string;
  linkUrl: string;
  startsAt: string; // ISO, or "" for now
  endsAt: string; // ISO, or "" for no end
  showEveryTime: boolean;
  imageUrl: string; // from uploadPopupImageAction, or "" for none
}

export interface PopupResult {
  error?: string;
  success?: boolean;
}

async function requireAdmin() {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return null;
  return { userId: user.id, organizationId: membership.organization.id };
}

const NOT_ALLOWED: PopupResult = { error: "Only an owner or admin can manage popups." };

function clean(input: PopupInput): { error: string } | { row: Record<string, unknown> } {
  const title = input.title.trim();
  if (title.length < 2) return { error: "Give the popup a title." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };
  const message = input.message.trim();
  if (message.length > 600) return { error: "Keep the message under 600 characters." };

  const label = input.buttonLabel.trim();
  const link = input.linkUrl.trim();
  if ((label && !link) || (!label && link)) return { error: "A button needs both a label and a link." };
  if (label.length > 30) return { error: "Keep the button label under 30 characters." };
  if (link) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return { error: "Enter a full link, like https://example.com." };
    }
    if (url.protocol !== "https:") return { error: "The link must start with https://." };
  }

  const starts = input.startsAt ? new Date(input.startsAt) : new Date();
  if (Number.isNaN(starts.getTime())) return { error: "Enter a valid start time." };
  let ends: Date | null = null;
  if (input.endsAt) {
    ends = new Date(input.endsAt);
    if (Number.isNaN(ends.getTime())) return { error: "Enter a valid end time." };
    if (ends <= starts) return { error: "The end time must be after the start time." };
  }

  const imageUrl = input.imageUrl.trim();
  if (imageUrl && !imageUrl.includes(`/storage/v1/object/public/${BUCKET}/`)) return { error: "That image isn't valid. Upload it again." };

  return {
    row: {
      image_url: imageUrl || null,
      title,
      message,
      button_label: label || null,
      link_url: link || null,
      starts_at: starts.toISOString(),
      ends_at: ends ? ends.toISOString() : null,
      show_every_time: input.showEveryTime,
    },
  };
}

export async function savePopupAction(id: string | null, input: PopupInput): Promise<PopupResult> {
  const actor = await requireAdmin();
  if (!actor) return NOT_ALLOWED;
  const parsed = clean(input);
  if ("error" in parsed) return { error: parsed.error };

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("app_popups").update({ ...parsed.row, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", actor.organizationId)
    : await admin.from("app_popups").insert({ ...parsed.row, organization_id: actor.organizationId, created_by: actor.userId, title: parsed.row.title as string });
  if (error) {
    console.error("app_popups save failed:", error.message);
    return { error: "Couldn't save the popup. Please try again." };
  }
  await removeUnusedImages(actor.organizationId);
  revalidatePath(PATH);
  return { success: true };
}

export async function setPopupActiveAction(id: string, active: boolean): Promise<PopupResult> {
  const actor = await requireAdmin();
  if (!actor) return NOT_ALLOWED;
  const { error } = await createAdminClient().from("app_popups").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", actor.organizationId);
  if (error) return { error: "Couldn't update the popup. Please try again." };
  revalidatePath(PATH);
  return { success: true };
}

export async function deletePopupAction(id: string): Promise<PopupResult> {
  const actor = await requireAdmin();
  if (!actor) return NOT_ALLOWED;
  const { error } = await createAdminClient().from("app_popups").delete().eq("id", id).eq("organization_id", actor.organizationId);
  if (error) return { error: "Couldn't delete the popup. Please try again." };
  await removeUnusedImages(actor.organizationId);
  revalidatePath(PATH);
  return { success: true };
}

export interface PopupImageResult {
  error?: string;
  url?: string;
}

// Uploads a popup's picture (JPEG, PNG or WebP, up to 2 MB) and returns its public link.
export async function uploadPopupImageAction(formData: FormData): Promise<PopupImageResult> {
  const actor = await requireAdmin();
  if (!actor) return { error: NOT_ALLOWED.error };
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: "Use a JPEG, PNG or WebP image." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "That image is over 2 MB. Try a smaller one." };
  const quotaError = await checkStorageQuota(actor.organizationId, file.size);
  if (quotaError) return { error: quotaError };

  const admin = createAdminClient();
  const path = `${actor.organizationId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type });
  if (error) return { error: "Couldn't upload that image. Try again." };
  return { url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

// Removes picture files no popup uses any more. Best effort: a stray file never breaks anything.
async function removeUnusedImages(organizationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin.from("app_popups").select("image_url").eq("organization_id", organizationId);
    const used = new Set((rows ?? []).map((r) => r.image_url).filter(Boolean).map((u) => (u as string).split(`/${BUCKET}/`)[1]));
    const { data: files } = await admin.storage.from(BUCKET).list(organizationId, { limit: 1000 });
    const cutoff = Date.now() - 60 * 60 * 1000; // a fresh upload isn't saved into a popup yet
    const stale = (files ?? []).filter((f) => !used.has(`${organizationId}/${f.name}`) && f.created_at && new Date(f.created_at).getTime() < cutoff).map((f) => `${organizationId}/${f.name}`);
    if (stale.length > 0) await admin.storage.from(BUCKET).remove(stale);
  } catch (err) {
    console.error("removeUnusedImages failed:", err);
  }
}
