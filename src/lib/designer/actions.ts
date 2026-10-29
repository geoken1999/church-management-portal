"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { SIZE_PRESETS, cleanDesignName, normalizeKind, sanitizeDoc, type DesignDoc } from "./model";
import { buildTemplate } from "./templates";
import { checkAiCreditQuota, recordAiReplyUsage } from "@/lib/plans/dal";
import { generateDesignLayout, type AiImageInput } from "./ai";
import type { ImageSlot } from "./ai-layout";

const DESIGNER_PATH = "/dashboard/studio";

export interface DesignActionResult {
  error?: string;
  id?: string;
}

export async function createDesign(input: { organizationId: string; name: string; template: string; size: string; customWidth?: number; customHeight?: number; churchName: string; doc?: DesignDoc }): Promise<DesignActionResult> {
  const user = await requireUser();
  const access = await checkTabAccess(input.organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };

  const preset = SIZE_PRESETS.find((p) => p.key === input.size);
  const width = input.doc?.width ?? preset?.width ?? Math.round(Number(input.customWidth));
  const height = input.doc?.height ?? preset?.height ?? Math.round(Number(input.customHeight));
  const kind = preset?.kind ?? "custom";
  const name = cleanDesignName(input.name) || "Untitled design";

  // A finished design (from the AI designer) arrives with its own pictures; otherwise start from the template.
  const checked = sanitizeDoc(input.doc ?? buildTemplate(input.template, width, height, input.churchName.slice(0, 80)));
  if ("error" in checked) return { error: checked.error };

  const { data, error } = await createAdminClient()
    .from("designs")
    .insert({ organization_id: input.organizationId, name, kind, width, height, doc: checked.doc, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't create the design. Please try again." };
  revalidatePath(DESIGNER_PATH);
  return { id: data.id };
}

async function ownedBy(id: string): Promise<string | null> {
  const { data } = await createAdminClient().from("designs").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function saveDesign(input: { id: string; name: string; doc: DesignDoc }): Promise<DesignActionResult> {
  await requireUser();
  const organizationId = await ownedBy(input.id);
  if (!organizationId) return { error: "That design no longer exists." };
  const access = await checkTabAccess(organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };

  const checked = sanitizeDoc(input.doc);
  if ("error" in checked) return { error: checked.error };
  const name = cleanDesignName(input.name) || "Untitled design";

  const { error } = await createAdminClient()
    .from("designs")
    .update({ name, doc: checked.doc, width: checked.doc.width, height: checked.doc.height })
    .eq("id", input.id);
  if (error) return { error: "Couldn't save the design. Please try again." };
  revalidatePath(DESIGNER_PATH);
  return { id: input.id };
}

export async function duplicateDesign(id: string): Promise<DesignActionResult> {
  const user = await requireUser();
  const organizationId = await ownedBy(id);
  if (!organizationId) return { error: "That design no longer exists." };
  const access = await checkTabAccess(organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { data: source } = await admin.from("designs").select("*").eq("id", id).maybeSingle();
  if (!source) return { error: "That design no longer exists." };
  const { data, error } = await admin
    .from("designs")
    .insert({
      organization_id: organizationId,
      name: `${source.name} copy`.slice(0, 80),
      kind: normalizeKind(source.kind),
      width: source.width,
      height: source.height,
      doc: source.doc,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't copy the design. Please try again." };
  revalidatePath(DESIGNER_PATH);
  return { id: data.id };
}

export async function deleteDesign(id: string): Promise<DesignActionResult> {
  await requireUser();
  const organizationId = await ownedBy(id);
  if (!organizationId) return {};
  const access = await checkTabAccess(organizationId, "designer", "delete");
  if (!access.ok) return { error: access.message };
  const { error } = await createAdminClient().from("designs").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the design. Please try again." };
  revalidatePath(DESIGNER_PATH);
  return {};
}

export interface AiDesignInput {
  organizationId: string;
  prompt: string;
  size: string;
  churchName: string;
  /** Small previews only; the full pictures never leave the browser. */
  images: AiImageInput[];
}

export interface AiDesignResult {
  error?: string;
  name?: string;
  doc?: DesignDoc;
  slots?: ImageSlot[];
  /** The size the design was made at (a preset), so the browser can create it. */
  size?: string;
}

const MAX_AI_IMAGES = 4;
const MAX_PREVIEW_CHARS = 450_000;

// One AI credit per design. The layout comes back with placeholders where the person's pictures go.
export async function generateAiDesign(input: AiDesignInput): Promise<AiDesignResult> {
  await requireUser();
  const access = await checkTabAccess(input.organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };

  const prompt = input.prompt.trim();
  if (prompt.length < 8) return { error: "Describe what the design is for, for example the event, date and mood." };
  if (prompt.length > 1500) return { error: "That description is too long. Keep it under 1,500 characters." };
  const preset = SIZE_PRESETS.find((p) => p.key === input.size);
  if (!preset) return { error: "Choose a size for the design." };
  if (!process.env.OPENAI_API_KEY) return { error: "The AI designer isn't set up yet." };

  const images: AiImageInput[] = [];
  for (const img of (input.images ?? []).slice(0, MAX_AI_IMAGES)) {
    const isLogo = img.ref === "logo";
    const okRef = isLogo || /^image[1-9]$/.test(img.ref);
    const okPreview = isLogo ? /^https:\/\//.test(img.preview) : /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img.preview) && img.preview.length <= MAX_PREVIEW_CHARS;
    if (!okRef || !okPreview) return { error: "One of the pictures couldn't be used. Remove it and add it again." };
    images.push({
      ref: img.ref,
      label: String(img.label ?? "").slice(0, 60),
      width: Math.max(1, Math.round(Number(img.width) || 1)),
      height: Math.max(1, Math.round(Number(img.height) || 1)),
      preview: img.preview,
    });
  }

  const quotaError = await checkAiCreditQuota(input.organizationId);
  if (quotaError) return { error: quotaError };

  const result = await generateDesignLayout({ prompt, width: preset.width, height: preset.height, churchName: input.churchName.slice(0, 80), images });
  if ("error" in result) return { error: result.error };

  await recordAiReplyUsage(input.organizationId, "design");
  return { name: result.name, doc: result.doc, slots: result.slots, size: preset.key };
}
