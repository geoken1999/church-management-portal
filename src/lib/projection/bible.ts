import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { BOOK_NAMES } from "@/lib/projection/books";
import { formatReference, parseReference, type PassageRef } from "@/lib/projection/reference";
import { pageReference, pageText, paginateVerses, type Slide, type VerseLine } from "@/lib/projection/slides";

// Bible text for the projector: the two public-domain English Bibles that ship with the app (KJV and WEB, see
// scripts/build-bible-data.py) and any translation a church added itself (stored per church).

export const BUILT_IN_TRANSLATIONS = [
  { key: "kjv", name: "King James Version (KJV)" },
  { key: "web", name: "World English Bible (WEB)" },
] as const;

type Compact = { books: string[][][] };
const cache = new Map<string, Compact>();

async function builtIn(key: string): Promise<Compact | null> {
  if (key !== "kjv" && key !== "web") return null;
  const cached = cache.get(key);
  if (cached) return cached;
  // Loaded on first use, so a request that never touches the Bible doesn't carry its 4 MB.
  const data = (key === "kjv" ? await import("@/data/bible/kjv.json") : await import("@/data/bible/web.json")).default as Compact;
  cache.set(key, data);
  return data;
}

export interface TranslationOption {
  key: string;
  name: string;
}

export async function listTranslations(organizationId: string): Promise<TranslationOption[]> {
  const { data } = await createAdminClient().from("bible_translations").select("id, name").eq("organization_id", organizationId).order("name");
  return [...BUILT_IN_TRANSLATIONS.map((t) => ({ key: t.key, name: t.name })), ...(data ?? []).map((t) => ({ key: `custom:${t.id}`, name: t.name }))];
}

async function translationName(organizationId: string, key: string): Promise<string | null> {
  const options = await listTranslations(organizationId);
  return options.find((o) => o.key === key)?.name ?? null;
}

/** The verses of a passage, or an error message in words a person can act on. */
async function versesOf(organizationId: string, key: string, ref: PassageRef): Promise<VerseLine[] | { error: string }> {
  const bookName = BOOK_NAMES[ref.book - 1];
  if (key.startsWith("custom:")) {
    const id = key.slice("custom:".length);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Choose a translation." };
    const admin = createAdminClient();
    const { data: translation } = await admin.from("bible_translations").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (!translation) return { error: "That translation isn't available." };
    let query = admin.from("bible_custom_verses").select("verse, text").eq("translation_id", id).eq("book", ref.book).eq("chapter", ref.chapter).gte("verse", ref.from).order("verse");
    if (ref.to !== null) query = query.lte("verse", ref.to);
    const { data } = await query;
    const rows = (data ?? []).map((v) => ({ verse: v.verse, text: v.text }));
    return rows.length > 0 ? rows : { error: `${formatReference(ref)} isn't in this translation.` };
  }
  const bible = await builtIn(key);
  if (!bible) return { error: "Choose a translation." };
  const chapter = bible.books[ref.book - 1]?.[ref.chapter - 1];
  if (!chapter) return { error: `${bookName} doesn't have a chapter ${ref.chapter}.` };
  const last = ref.to === null ? chapter.length : Math.min(ref.to, chapter.length);
  if (ref.from > chapter.length) return { error: `${bookName} ${ref.chapter} has only ${chapter.length} verses.` };
  const lines: VerseLine[] = [];
  for (let verse = ref.from; verse <= last; verse++) lines.push({ verse, text: chapter[verse - 1] || "(This verse is not in this translation.)" });
  return lines;
}

/** What to put on the screen for a typed reference: one slide per page of verses. */
export async function lookupPassage(organizationId: string, translationKey: string, query: string): Promise<{ slides: Slide[] } | { error: string }> {
  const ref = parseReference(query);
  if (!ref) return { error: 'Type a reference such as "John 3:16", "Ps 23" or "1 Cor 13:4-7".' };
  const name = await translationName(organizationId, translationKey);
  if (!name) return { error: "Choose a translation." };
  const verses = await versesOf(organizationId, translationKey, ref);
  if ("error" in verses) return verses;
  const bookName = BOOK_NAMES[ref.book - 1];
  const short = name.match(/\(([^)]+)\)$/)?.[1] ?? name;
  return { slides: paginateVerses(verses).map((page) => ({ kind: "bible" as const, title: pageReference(bookName, ref.chapter, page), text: pageText(page), footer: short })) };
}

export interface VerseHit {
  reference: string;
  text: string;
}

/** Verses containing every word typed. Built-in translations scan in memory; a church's own are searched in its database. */
export async function searchVerses(organizationId: string, translationKey: string, text: string, limit = 30): Promise<VerseHit[] | { error: string }> {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return { error: "Type a word or two to search for." };
  if (translationKey.startsWith("custom:")) {
    const id = translationKey.slice("custom:".length);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Choose a translation." };
    const admin = createAdminClient();
    const { data: translation } = await admin.from("bible_translations").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (!translation) return { error: "That translation isn't available." };
    let query = admin.from("bible_custom_verses").select("book, chapter, verse, text").eq("translation_id", id);
    for (const word of words) query = query.ilike("text", `%${word.replace(/[%_]/g, "")}%`);
    const { data } = await query.order("book").order("chapter").order("verse").limit(limit);
    return (data ?? []).map((v) => ({ reference: `${BOOK_NAMES[v.book - 1]} ${v.chapter}:${v.verse}`, text: v.text }));
  }
  const bible = await builtIn(translationKey);
  if (!bible) return { error: "Choose a translation." };
  const hits: VerseHit[] = [];
  for (let b = 0; b < bible.books.length && hits.length < limit; b++) {
    for (let c = 0; c < bible.books[b].length && hits.length < limit; c++) {
      const chapter = bible.books[b][c];
      for (let v = 0; v < chapter.length && hits.length < limit; v++) {
        const lower = chapter[v].toLowerCase();
        if (words.every((w) => lower.includes(w))) hits.push({ reference: `${BOOK_NAMES[b]} ${c + 1}:${v + 1}`, text: chapter[v] });
      }
    }
  }
  return hits;
}
