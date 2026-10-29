import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { BOOK_NAMES } from "@/lib/projection/books";
import { formatReference, parseReference, type PassageRef } from "@/lib/projection/reference";
import { apiBibleChapter, apiBibleSearch, listApiBibles } from "@/lib/projection/api-bible";
import { MAX_COMPARED, MAX_SLIDE_CHARS, pageReference, pageText, paginateVerses, type Slide, type VerseLine } from "@/lib/projection/slides";

// Bible text for the projector, from three places:
//  - Bibles that ship with the app and are free to redistribute (see scripts/build-bible-data.py and
//    build-bible-extra.py): English public-domain ones, and the Hindi and Tamil Indian Revised Versions (CC BY-SA 4.0).
//  - Licensed translations (ESV, NKJV, NIV...) read live from API.Bible when API_BIBLE_KEY is set; their text is never stored.
//  - Any translation a church added itself (stored per church).

export const BUILT_IN_TRANSLATIONS = [
  { key: "kjv", name: "King James Version (KJV)", note: "public domain" },
  { key: "web", name: "World English Bible (WEB)", note: "public domain" },
  { key: "bsb", name: "Berean Standard Bible (BSB)", note: "public domain" },
  { key: "asv", name: "American Standard Version (ASV)", note: "public domain" },
  { key: "ylt", name: "Young's Literal Translation (YLT)", note: "public domain" },
  { key: "darby", name: "Darby Bible (DARBY)", note: "public domain" },
  { key: "bbe", name: "Bible in Basic English (BBE)", note: "public domain" },
  { key: "hin", name: "हिन्दी – Indian Revised Version (IRV-HI)", note: "© Bridge Connectivity Solutions, CC BY-SA 4.0" },
  { key: "tam", name: "தமிழ் – Indian Revised Version (IRV-TA)", note: "© Bridge Connectivity Solutions, CC BY-SA 4.0" },
] as const;

type Compact = { books: string[][][] };
const cache = new Map<string, Compact>();

// Each is its own import so the bundler can find the file; loaded on first use, so a request that never
// touches the Bible doesn't carry its 4-12 MB.
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  kjv: () => import("@/data/bible/kjv.json"),
  web: () => import("@/data/bible/web.json"),
  bsb: () => import("@/data/bible/bsb.json"),
  asv: () => import("@/data/bible/asv.json"),
  ylt: () => import("@/data/bible/ylt.json"),
  darby: () => import("@/data/bible/darby.json"),
  bbe: () => import("@/data/bible/bbe.json"),
  hin: () => import("@/data/bible/hin.json"),
  tam: () => import("@/data/bible/tam.json"),
};

async function builtIn(key: string): Promise<Compact | null> {
  const load = LOADERS[key];
  if (!load) return null;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = (await load()).default as Compact;
  cache.set(key, data);
  return data;
}

export interface TranslationOption {
  key: string;
  name: string;
  /** Where it comes from / its licence, shown in the settings. */
  note: string;
}

export async function listTranslations(organizationId: string): Promise<TranslationOption[]> {
  const [{ data }, licensed] = await Promise.all([
    createAdminClient().from("bible_translations").select("id, name").eq("organization_id", organizationId).order("name"),
    listApiBibles(),
  ]);
  return [
    ...BUILT_IN_TRANSLATIONS.map((t) => ({ key: t.key, name: t.name, note: t.note })),
    ...licensed.map((b) => ({ key: `api:${b.id}`, name: b.name, note: "licensed, via API.Bible" })),
    ...(data ?? []).map((t) => ({ key: `custom:${t.id}`, name: t.name, note: "your own" })),
  ];
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
  if (key.startsWith("api:")) {
    const chapter = await apiBibleChapter(key.slice(4), ref.book, ref.chapter);
    if ("error" in chapter) return chapter;
    const rows = chapter.verses.filter((v) => v.verse >= ref.from && (ref.to === null || v.verse <= ref.to));
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

const shortName = (name: string) => name.match(/\(([^)]+)\)$/)?.[1] ?? name;

/**
 * What to put on the screen for a typed reference: one slide per page of verses. With several translations each slide
 * shows the same verses in all of them (the first is the main one), and pages are cut to fit them together.
 */
export async function lookupPassage(organizationId: string, translationKeys: string | string[], query: string): Promise<{ slides: Slide[] } | { error: string }> {
  const ref = parseReference(query);
  if (!ref) return { error: 'Type a reference such as "John 3:16", "Ps 23" or "1 Cor 13:4-7".' };
  const keys = [...new Set(Array.isArray(translationKeys) ? translationKeys : [translationKeys])].slice(0, MAX_COMPARED);
  if (keys.length === 0) return { error: "Choose a translation." };

  const found: { name: string; verses: VerseLine[] }[] = [];
  for (const key of keys) {
    const name = await translationName(organizationId, key);
    if (!name) return { error: "Choose a translation." };
    const verses = await versesOf(organizationId, key, ref);
    if ("error" in verses) return { error: keys.length > 1 ? `${shortName(name)}: ${verses.error}` : verses.error };
    found.push({ name, verses });
  }

  const bookName = BOOK_NAMES[ref.book - 1];
  if (found.length === 1) {
    const short = shortName(found[0].name);
    return { slides: paginateVerses(found[0].verses).map((page) => ({ kind: "bible" as const, title: pageReference(bookName, ref.chapter, page), text: pageText(page), footer: short })) };
  }

  // Cut the pages on the verses all the translations share, sized by the longest side so each column still fits.
  const numbers = [...new Set(found.flatMap((f) => f.verses.map((v) => v.verse)))].sort((a, b) => a - b);
  const byVerse = found.map((f) => new Map(f.verses.map((v) => [v.verse, v.text])));
  const sizing: VerseLine[] = numbers.map((verse) => ({ verse, text: byVerse.reduce((longest, m) => ((m.get(verse) ?? "").length > longest.length ? m.get(verse)! : longest), "") }));
  const footer = found.map((f) => shortName(f.name)).join(" · ");
  const maxChars = found.length === 2 ? MAX_SLIDE_CHARS : Math.round(MAX_SLIDE_CHARS * 0.8);
  return {
    slides: paginateVerses(sizing, maxChars).map((page) => {
      const versions = found
        .map((f, i) => ({ name: shortName(f.name), text: pageText(page.filter((p) => byVerse[i].has(p.verse)).map((p) => ({ verse: p.verse, text: byVerse[i].get(p.verse)! }))) }))
        .filter((v) => v.text);
      return { kind: "bible" as const, title: pageReference(bookName, ref.chapter, page), text: versions.map((v) => v.text).join("\n\n"), footer, versions };
    }),
  };
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
  if (translationKey.startsWith("api:")) return apiBibleSearch(translationKey.slice(4), text, limit);
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
