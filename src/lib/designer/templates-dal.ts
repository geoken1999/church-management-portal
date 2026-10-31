import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { DesignCategoryRow, DesignTemplateRow } from "@/types/database";
import { orientationOf } from "./catalog";

// The template library is platform-wide and read through the server only. Every list is paged, because each card
// carries the template's design to draw its preview.

export const TEMPLATE_PAGE_SIZE = 24;

export type TemplateSort = "recommended" | "popular" | "newest";
export type TemplateListItem = Pick<DesignTemplateRow, "id" | "slug" | "title" | "category_id" | "width" | "height" | "tags" | "is_premium" | "published" | "popularity" | "featured_rank" | "updated_at" | "doc"> & {
  orientation: "landscape" | "portrait" | "square";
  favorite: boolean;
};

export interface TemplateFilters {
  q?: string;
  category?: string;
  /** "1280x720" or an orientation name. */
  size?: string;
  price?: "free" | "premium";
  sort?: TemplateSort;
  favoritesOnly?: boolean;
  page?: number;
}

export async function getCategories(): Promise<DesignCategoryRow[]> {
  const { data } = await createAdminClient().from("design_categories").select("*").order("sort_order").order("name");
  return data ?? [];
}

/** Keeps a search to plain words, so it can't carry filter syntax into the query. */
export function cleanSearch(value: string | undefined): string {
  return (value ?? "").replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

const LIST_COLUMNS = "id, slug, title, category_id, width, height, tags, is_premium, published, popularity, featured_rank, updated_at, doc";

function withExtras(rows: Omit<TemplateListItem, "orientation" | "favorite">[], favorites: Set<string>): TemplateListItem[] {
  return rows.map((r) => ({ ...r, orientation: orientationOf(r.width, r.height), favorite: favorites.has(r.id) }));
}

export async function getFavoriteIds(organizationId: string, userId: string): Promise<Set<string>> {
  const { data } = await createAdminClient().from("design_favorites").select("template_id").eq("organization_id", organizationId).eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.template_id));
}

export async function listTemplates(organizationId: string, userId: string, filters: TemplateFilters): Promise<{ items: TemplateListItem[]; total: number; page: number }> {
  const admin = createAdminClient();
  const favorites = await getFavoriteIds(organizationId, userId);
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  if (filters.favoritesOnly && favorites.size === 0) return { items: [], total: 0, page };

  let query = admin.from("design_templates").select(LIST_COLUMNS, { count: "exact" }).eq("published", true);
  if (filters.favoritesOnly) query = query.in("id", [...favorites]);
  if (filters.category) {
    const { data: cat } = await admin.from("design_categories").select("id").eq("slug", filters.category).maybeSingle();
    if (!cat) return { items: [], total: 0, page };
    query = query.eq("category_id", cat.id);
  }
  const q = cleanSearch(filters.q);
  if (q) {
    const words = q.split(" ").filter(Boolean).slice(0, 5);
    for (const word of words) {
      // Every word must match the title or one of the tags.
      query = query.or(`title.ilike.%${word}%,tags.cs.{${word.toLowerCase()}}`);
    }
  }
  const size = /^(\d{3,4})x(\d{3,4})$/.exec(filters.size ?? "");
  if (size) query = query.eq("width", Number(size[1])).eq("height", Number(size[2]));
  if (filters.price === "free") query = query.eq("is_premium", false);
  if (filters.price === "premium") query = query.eq("is_premium", true);

  const sort = filters.sort ?? "recommended";
  if (sort === "newest") query = query.order("created_at", { ascending: false });
  else if (sort === "popular") query = query.order("popularity", { ascending: false }).order("created_at", { ascending: false });
  else query = query.order("featured_rank", { ascending: false }).order("popularity", { ascending: false }).order("created_at", { ascending: false });

  const from = (page - 1) * TEMPLATE_PAGE_SIZE;
  const { data, count } = await query.range(from, from + TEMPLATE_PAGE_SIZE - 1);
  return { items: withExtras(data ?? [], favorites), total: count ?? 0, page };
}

/** The distinct sizes on offer, for the size filter. */
export async function getTemplateSizes(): Promise<{ width: number; height: number }[]> {
  const { data } = await createAdminClient().from("design_templates").select("width, height").eq("published", true).limit(2000);
  const seen = new Map<string, { width: number; height: number }>();
  for (const r of data ?? []) seen.set(`${r.width}x${r.height}`, r);
  return [...seen.values()].sort((a, b) => a.width * a.height - b.width * b.height);
}

export async function getTemplatesByIds(ids: string[], organizationId: string, userId: string): Promise<TemplateListItem[]> {
  if (ids.length === 0) return [];
  const favorites = await getFavoriteIds(organizationId, userId);
  const { data } = await createAdminClient().from("design_templates").select(LIST_COLUMNS).in("id", ids).eq("published", true);
  return withExtras(data ?? [], favorites);
}

export async function getTemplate(id: string): Promise<DesignTemplateRow | null> {
  const { data } = await createAdminClient().from("design_templates").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

/** For the platform admin: every template, published or not, without the design (which can be large). */
export async function listAllTemplatesForAdmin(): Promise<Omit<DesignTemplateRow, "doc">[]> {
  const { data } = await createAdminClient()
    .from("design_templates")
    .select("id, slug, title, category_id, width, height, tags, is_premium, published, popularity, featured_rank, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  return data ?? [];
}
