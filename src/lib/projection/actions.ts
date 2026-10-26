"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLiveStreamEnabled, LIVE_STREAM_NOT_ENABLED } from "@/lib/livestream/access";
import { lookupPassage, searchVerses, type VerseHit } from "@/lib/projection/bible";
import { MAX_IMPORT_VERSES, parseVerseLines } from "@/lib/projection/import";
import { updateScreen } from "@/lib/projection/service";
import { cleanTheme } from "@/lib/projection/theme";
import type { ProjectionSlide, ProjectionTheme } from "@/types/database";
import type { Slide } from "@/lib/projection/slides";

const PATH = "/dashboard/livestream/projection";

export interface ProjectionResult {
  error?: string;
}

// Every projection action is the Live stream permission: reading to look things up, writing to change the screen.
async function gate(level: "read" | "write"): Promise<{ organizationId: string; userId: string } | { error: string }> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "livestream", level);
  if (!access.ok) return { error: access.message };
  if (!(await isLiveStreamEnabled(organizationId))) return { error: LIVE_STREAM_NOT_ENABLED };
  return { organizationId, userId: user.id };
}

export async function lookupPassageAction(translation: string, query: string): Promise<{ error?: string; slides?: Slide[] }> {
  const g = await gate("read");
  if ("error" in g) return g;
  const result = await lookupPassage(g.organizationId, translation, query);
  return "error" in result ? { error: result.error } : { slides: result.slides };
}

export async function searchVersesAction(translation: string, text: string): Promise<{ error?: string; hits?: VerseHit[] }> {
  const g = await gate("read");
  if ("error" in g) return g;
  const result = await searchVerses(g.organizationId, translation, text);
  return Array.isArray(result) ? { hits: result } : { error: result.error };
}

const cleanSlide = (slide: Slide): ProjectionSlide | null => {
  const text = String(slide.text ?? "").slice(0, 2000);
  if (!text.trim()) return null;
  const kind = slide.kind === "bible" || slide.kind === "song" || slide.kind === "announcement" ? slide.kind : "custom";
  return { kind, title: String(slide.title ?? "").slice(0, 120), text, footer: String(slide.footer ?? "").slice(0, 80) };
};

/** Puts a slide on the screen and makes the screen visible. */
export async function showSlideAction(slide: Slide): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  const clean = cleanSlide(slide);
  if (!clean) return { error: "There is nothing to show on that slide." };
  await updateScreen(g.organizationId, { slide: clean, visible: true });
  return {};
}

/** Blanks the screen (the slide is kept, so it can be brought back). */
export async function setVisibleAction(visible: boolean): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  await updateScreen(g.organizationId, { visible });
  return {};
}

export async function setModeAction(mode: "full" | "lower_third"): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  await updateScreen(g.organizationId, { mode: mode === "lower_third" ? "lower_third" : "full" });
  return {};
}

export async function setThemeAction(theme: ProjectionTheme): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  await updateScreen(g.organizationId, { theme: cleanTheme(theme) });
  return {};
}

/** A new secret address: the old one stops working at once. */
export async function regenerateTokenAction(): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  await updateScreen(g.organizationId, { token: randomUUID() });
  revalidatePath(PATH);
  return {};
}

export interface ItemInput {
  id?: string;
  kind: "song" | "announcement" | "custom";
  title: string;
  body: string;
}

export async function saveItemAction(input: ItemInput): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 20000);
  if (!title) return { error: "Give it a title." };
  if (!body) return { error: "Write the text to project." };
  const kind = input.kind === "song" || input.kind === "announcement" ? input.kind : "custom";
  const admin = createAdminClient();
  const { error } = input.id
    ? await admin.from("projection_items").update({ kind, title, body }).eq("id", input.id).eq("organization_id", g.organizationId)
    : await admin.from("projection_items").insert({ organization_id: g.organizationId, kind, title, body, created_by: g.userId });
  if (error) return { error: "Couldn't save that. Please try again." };
  revalidatePath(PATH);
  return {};
}

export async function deleteItemAction(id: string): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  await createAdminClient().from("projection_items").delete().eq("id", id).eq("organization_id", g.organizationId);
  revalidatePath(PATH);
  return {};
}

/** Adds a translation the church has the right to use, from pasted text, one verse a line. */
export async function importTranslationAction(name: string, text: string): Promise<{ error?: string; imported?: number; problems?: string[] }> {
  const g = await gate("write");
  if ("error" in g) return g;
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) return { error: "Give the translation a name." };
  const { verses, problems } = parseVerseLines(text);
  if (verses.length === 0) return { error: "No verses found. Each line should look like: John 3:16 For God so loved the world…", problems: problems.slice(0, 10) };
  if (verses.length > MAX_IMPORT_VERSES) return { error: `That is more than ${MAX_IMPORT_VERSES.toLocaleString()} verses. Import it in parts.` };

  const admin = createAdminClient();
  const code = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 14) || "bible"}-${randomUUID().slice(0, 4)}`;
  const { data: translation, error } = await admin.from("bible_translations").insert({ organization_id: g.organizationId, code, name: cleanName }).select("id").single();
  if (error || !translation) return { error: "Couldn't add the translation. Please try again." };
  for (let i = 0; i < verses.length; i += 1000) {
    const { error: batchError } = await admin
      .from("bible_custom_verses")
      .insert(verses.slice(i, i + 1000).map((v) => ({ translation_id: translation.id, book: v.book, chapter: v.chapter, verse: v.verse, text: v.text })));
    if (batchError) {
      await admin.from("bible_translations").delete().eq("id", translation.id);
      return { error: "Couldn't save the verses, so nothing was added. Please try again." };
    }
  }
  revalidatePath(PATH);
  return { imported: verses.length, problems: problems.slice(0, 10) };
}

export async function deleteTranslationAction(id: string): Promise<ProjectionResult> {
  const g = await gate("write");
  if ("error" in g) return g;
  await createAdminClient().from("bible_translations").delete().eq("id", id).eq("organization_id", g.organizationId);
  revalidatePath(PATH);
  return {};
}
