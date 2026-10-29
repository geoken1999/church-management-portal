"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { SIZE_PRESETS, cleanDesignName, normalizeKind, sanitizeDoc, type DesignDoc } from "./model";
import { buildTemplate } from "./templates";

const DESIGNER_PATH = "/dashboard/studio";

export interface DesignActionResult {
  error?: string;
  id?: string;
}

export async function createDesign(input: { organizationId: string; name: string; template: string; size: string; customWidth?: number; customHeight?: number; churchName: string }): Promise<DesignActionResult> {
  const user = await requireUser();
  const access = await checkTabAccess(input.organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };

  const preset = SIZE_PRESETS.find((p) => p.key === input.size);
  const width = preset?.width ?? Math.round(Number(input.customWidth));
  const height = preset?.height ?? Math.round(Number(input.customHeight));
  const kind = preset?.kind ?? "custom";
  const name = cleanDesignName(input.name) || "Untitled design";

  const checked = sanitizeDoc(buildTemplate(input.template, width, height, input.churchName.slice(0, 80)));
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
