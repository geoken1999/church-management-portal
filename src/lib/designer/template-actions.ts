"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getPlanLimits } from "@/lib/plans/dal";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { cleanDesignName, sanitizeDoc } from "./model";
import { CATEGORIES, buildStarterTemplates } from "./catalog";
import { getTemplate } from "./templates-dal";

const STUDIO_PATH = "/dashboard/studio";
const ADMIN_PATH = "/platform-admin/design-templates";

export interface TemplateActionResult {
  error?: string;
  id?: string;
  message?: string;
}

// --- church side -------------------------------------------------------------------------------------------------

export async function toggleTemplateFavorite(input: { organizationId: string; templateId: string }): Promise<TemplateActionResult & { favorite?: boolean }> {
  const user = await requireUser();
  const access = await checkTabAccess(input.organizationId, "designer", "read");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const key = { organization_id: input.organizationId, user_id: user.id, template_id: input.templateId };
  const { data: existing } = await admin.from("design_favorites").select("template_id").match(key).maybeSingle();
  if (existing) {
    await admin.from("design_favorites").delete().match(key);
    return { favorite: false };
  }
  const { error } = await admin.from("design_favorites").insert(key);
  if (error) return { error: "Couldn't save that favourite. Please try again." };
  return { favorite: true };
}

/** Starts a new design from a template. Premium templates are checked here, on the server, against the church's plan. */
export async function createDesignFromTemplate(input: { organizationId: string; templateId: string; name?: string }): Promise<TemplateActionResult> {
  const user = await requireUser();
  const access = await checkTabAccess(input.organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };

  const template = await getTemplate(input.templateId);
  if (!template || !template.published) return { error: "That template is no longer available." };
  if (template.is_premium) {
    const plan = await getPlanLimits(input.organizationId);
    if (plan.id === "basic") return { error: "This is a premium template. Upgrade your plan to use it." };
  }
  const checked = sanitizeDoc(template.doc);
  if ("error" in checked) return { error: "That template couldn't be opened." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("designs")
    .insert({
      organization_id: input.organizationId,
      name: cleanDesignName(input.name) || template.title.slice(0, 80),
      kind: "custom",
      width: checked.doc.width,
      height: checked.doc.height,
      doc: checked.doc,
      template_id: template.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't create the design. Please try again." };
  // Popularity counts how often a template is used. A lost increment under a race is harmless.
  await admin.from("design_templates").update({ popularity: template.popularity + 1 }).eq("id", template.id);
  revalidatePath(STUDIO_PATH, "layout");
  return { id: data.id };
}

// --- trash -------------------------------------------------------------------------------------------------------

async function designOrg(id: string): Promise<string | null> {
  const { data } = await createAdminClient().from("designs").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function restoreDesign(id: string): Promise<TemplateActionResult> {
  await requireUser();
  const organizationId = await designOrg(id);
  if (!organizationId) return { error: "That design no longer exists." };
  const access = await checkTabAccess(organizationId, "designer", "write");
  if (!access.ok) return { error: access.message };
  const { error } = await createAdminClient().from("designs").update({ deleted_at: null }).eq("id", id);
  if (error) return { error: "Couldn't restore the design. Please try again." };
  revalidatePath(STUDIO_PATH, "layout");
  return {};
}

export async function deleteDesignForever(id: string): Promise<TemplateActionResult> {
  await requireUser();
  const organizationId = await designOrg(id);
  if (!organizationId) return {};
  const access = await checkTabAccess(organizationId, "designer", "delete");
  if (!access.ok) return { error: access.message };
  const { error } = await createAdminClient().from("designs").delete().eq("id", id).not("deleted_at", "is", null);
  if (error) return { error: "Couldn't delete the design. Please try again." };
  revalidatePath(STUDIO_PATH, "layout");
  return {};
}

export async function emptyTrash(organizationId: string): Promise<TemplateActionResult> {
  await requireUser();
  const access = await checkTabAccess(organizationId, "designer", "delete");
  if (!access.ok) return { error: access.message };
  const { error } = await createAdminClient().from("designs").delete().eq("organization_id", organizationId).not("deleted_at", "is", null);
  if (error) return { error: "Couldn't empty the trash. Please try again." };
  revalidatePath(STUDIO_PATH, "layout");
  return {};
}

// --- super admin -------------------------------------------------------------------------------------------------

function cleanTags(value: string): string[] {
  return [...new Set(value.split(",").map((t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N} '-]/gu, "")).filter(Boolean))].slice(0, 20);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

/** Adds the generated starter library. Safe to run again: templates are matched by slug and never overwritten. */
export async function installStarterLibrary(): Promise<TemplateActionResult> {
  const user = await requirePlatformAdmin();
  const admin = createAdminClient();

  const groups = [...new Set(CATEGORIES.map((c) => c.group))];
  const { error: catError } = await admin.from("design_categories").upsert(
    CATEGORIES.map((c, i) => ({ slug: c.slug, name: c.name, group_name: c.group, sort_order: groups.indexOf(c.group) * 100 + i })),
    { onConflict: "slug", ignoreDuplicates: true },
  );
  if (catError) return { error: "Couldn't add the categories. Has migration 0235 been applied?" };
  const { data: cats } = await admin.from("design_categories").select("id, slug");
  const idBySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));

  const rows = buildStarterTemplates().flatMap((t) => {
    const category_id = idBySlug.get(t.categorySlug);
    return category_id
      ? [{ slug: t.slug, title: t.title, category_id, width: t.width, height: t.height, tags: t.tags, is_premium: t.isPremium, featured_rank: t.featuredRank, published: true, doc: t.doc, created_by: user.id }]
      : [];
  });
  let added = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await admin.from("design_templates").upsert(rows.slice(i, i + 50), { onConflict: "slug", ignoreDuplicates: true }).select("id");
    if (error) return { error: `Stopped after ${added} templates: ${error.message}` };
    added += data?.length ?? 0;
  }
  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDIO_PATH, "layout");
  return { message: added === 0 ? "The starter library is already installed." : `Added ${added} templates.` };
}

export async function updateTemplate(input: { id: string; title: string; categoryId: string; tags: string; isPremium: boolean; published: boolean; featuredRank: number }): Promise<TemplateActionResult> {
  await requirePlatformAdmin();
  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Give the template a title." };
  const { error } = await createAdminClient()
    .from("design_templates")
    .update({ title, category_id: input.categoryId, tags: cleanTags(input.tags), is_premium: input.isPremium, published: input.published, featured_rank: Math.max(0, Math.min(1000, Math.round(input.featuredRank) || 0)) })
    .eq("id", input.id);
  if (error) return { error: "Couldn't save the template." };
  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDIO_PATH, "layout");
  return {};
}

export async function setTemplatesPublished(ids: string[], published: boolean): Promise<TemplateActionResult> {
  await requirePlatformAdmin();
  if (ids.length === 0) return {};
  const { error } = await createAdminClient().from("design_templates").update({ published }).in("id", ids.slice(0, 500));
  if (error) return { error: "Couldn't update the templates." };
  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDIO_PATH, "layout");
  return {};
}

export async function deleteTemplate(id: string): Promise<TemplateActionResult> {
  await requirePlatformAdmin();
  const { error } = await createAdminClient().from("design_templates").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the template." };
  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDIO_PATH, "layout");
  return {};
}

/** Adds one template from a design's JSON (for example copied out of another template, or exported from the editor). */
export async function importTemplate(input: { title: string; categoryId: string; tags: string; isPremium: boolean; published: boolean; json: string }): Promise<TemplateActionResult> {
  const user = await requirePlatformAdmin();
  const title = input.title.trim().slice(0, 120);
  if (!title) return { error: "Give the template a title." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.json);
  } catch {
    return { error: "That isn't valid JSON." };
  }
  const checked = sanitizeDoc(parsed);
  if ("error" in checked) return { error: checked.error };
  const slug = `${slugify(title) || "template"}-${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await createAdminClient()
    .from("design_templates")
    .insert({ slug, title, category_id: input.categoryId, width: checked.doc.width, height: checked.doc.height, tags: cleanTags(input.tags), is_premium: input.isPremium, published: input.published, doc: checked.doc, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add the template." };
  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDIO_PATH, "layout");
  return { id: data.id, message: "Template added." };
}
