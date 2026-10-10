"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { checkStorageQuota } from "@/lib/plans/dal";
import { readJpegSize } from "@/lib/member-home/image";
import { BANNER_HEIGHT, BANNER_WIDTH, HOME_IMAGES_BUCKET, MAX_BANNER_BYTES, bannerImageUrl, sanitizeLayout, type HomeLayout } from "@/lib/member-home/schema";

const STUDIO_PATH = "/dashboard/mobile/design-studio";

export interface DesignStudioResult {
  error?: string;
  success?: boolean;
}

async function requireOrgAdmin() {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return null;
  return { userId: user.id, organizationId: membership.organization.id };
}

const NOT_ALLOWED: DesignStudioResult = { error: "Only an owner or admin can change the member home page." };

// Frees storage from banner images no draft or published layout uses any
// more (a removed slide, a replaced image, a discarded draft). Files
// uploaded in the last hour are kept: an upload happens before its slide is
// saved into a draft, so a fresh file isn't yet referenced. Best effort: a
// failure leaves a stray file, never breaks the save.
async function removeUnusedBannerImages(organizationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin.from("member_home_layouts").select("layout").eq("organization_id", organizationId);
    const used = new Set<string>();
    for (const row of rows ?? []) {
      for (const block of ((row.layout as { blocks?: unknown[] })?.blocks ?? []) as { type?: string; slides?: { imagePath?: string }[] }[]) {
        if (block.type === "banner") for (const slide of block.slides ?? []) if (slide.imagePath) used.add(slide.imagePath);
      }
    }

    const { data: files } = await admin.storage.from(HOME_IMAGES_BUCKET).list(organizationId, { limit: 1000 });
    const cutoff = Date.now() - 60 * 60 * 1000;
    const stale = (files ?? [])
      .filter((file) => !used.has(`${organizationId}/${file.name}`) && file.created_at && new Date(file.created_at).getTime() < cutoff)
      .map((file) => `${organizationId}/${file.name}`);
    if (stale.length > 0) await admin.storage.from(HOME_IMAGES_BUCKET).remove(stale);
  } catch (err) {
    console.error("removeUnusedBannerImages failed:", err);
  }
}

export async function saveHomeDraftAction(layout: HomeLayout): Promise<DesignStudioResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const parsed = sanitizeLayout(layout, actor.organizationId);
  if (parsed.error) return { error: parsed.error };

  const admin = createAdminClient();
  const { error } = await admin.from("member_home_layouts").upsert(
    { organization_id: actor.organizationId, status: "draft", layout: parsed.layout as unknown as Record<string, unknown>, updated_by: actor.userId, updated_at: new Date().toISOString() },
    { onConflict: "organization_id,status" },
  );
  if (error) return { error: "Couldn't save your draft." };

  await removeUnusedBannerImages(actor.organizationId);
  revalidatePath(STUDIO_PATH);
  return { success: true };
}

// Validates the layout again server-side and writes it to both rows, so
// publishing always publishes exactly what was just checked, not whatever
// the last autosaved draft happened to be.
export async function publishHomeLayoutAction(layout: HomeLayout): Promise<DesignStudioResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const parsed = sanitizeLayout(layout, actor.organizationId);
  if (parsed.error) return { error: parsed.error };

  const now = new Date().toISOString();
  const value = parsed.layout as unknown as Record<string, unknown>;
  const admin = createAdminClient();
  const { error } = await admin.from("member_home_layouts").upsert(
    [
      { organization_id: actor.organizationId, status: "draft", layout: value, updated_by: actor.userId, updated_at: now },
      { organization_id: actor.organizationId, status: "published", layout: value, updated_by: actor.userId, updated_at: now },
    ],
    { onConflict: "organization_id,status" },
  );
  if (error) return { error: "Couldn't publish. Try again." };

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: "Member home page published",
    organizationId: actor.organizationId,
    metadata: { blocks: parsed.layout?.blocks.length ?? 0 },
  });

  await removeUnusedBannerImages(actor.organizationId);
  revalidatePath(STUDIO_PATH);
  return { success: true };
}

// Throws the draft away and goes back to what members currently see.
export async function discardHomeDraftAction(): Promise<DesignStudioResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const admin = createAdminClient();
  const { error } = await admin.from("member_home_layouts").delete().eq("organization_id", actor.organizationId).eq("status", "draft");
  if (error) return { error: "Couldn't discard the draft." };

  await removeUnusedBannerImages(actor.organizationId);
  revalidatePath(STUDIO_PATH);
  return { success: true };
}

export interface UploadBannerResult {
  error?: string;
  imagePath?: string;
  url?: string;
}

// The editor crops to exactly BANNER_WIDTH x BANNER_HEIGHT and re-encodes
// as a JPEG before sending, so the server only has to confirm that, not
// resize. Counts against the church's storage package like every other
// upload.
export async function uploadBannerImageAction(formData: FormData): Promise<UploadBannerResult> {
  const actor = await requireOrgAdmin();
  if (!actor) return NOT_ALLOWED;

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (file.type !== "image/jpeg") return { error: "Banner images must be JPEG." };
  if (file.size > MAX_BANNER_BYTES) return { error: "That image is too large. Try a simpler picture." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = readJpegSize(bytes);
  if (!size || size.width !== BANNER_WIDTH || size.height !== BANNER_HEIGHT) {
    return { error: `Banner images must be exactly ${BANNER_WIDTH}×${BANNER_HEIGHT}. Use the crop tool and try again.` };
  }

  const quotaError = await checkStorageQuota(actor.organizationId, file.size);
  if (quotaError) return { error: quotaError };

  const admin = createAdminClient();
  const imagePath = `${actor.organizationId}/${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage.from(HOME_IMAGES_BUCKET).upload(imagePath, bytes, { contentType: "image/jpeg" });
  if (error) return { error: "Couldn't upload that image. Try again." };

  const { data } = admin.storage.from(HOME_IMAGES_BUCKET).getPublicUrl(imagePath);
  return { imagePath, url: data.publicUrl ?? bannerImageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", imagePath) };
}
