import "server-only";

import { BOOK_NAMES } from "@/lib/projection/books";
import { splitNumberedVerses, USFM_CODES } from "@/lib/projection/verse-text";
import type { VerseLine } from "@/lib/projection/slides";

// Licensed translations (ESV, NKJV, NASB, Tamil and Hindi versions, ...) read live from API.Bible, so the app never
// stores their text. Switched on by API_BIBLE_KEY. Which Bibles appear is limited by what the key's account has been
// given access to at https://scripture.api.bible, and optionally by API_BIBLE_IDS (comma-separated Bible ids).
// Each translation's own licence applies; the church is responsible for using it as that licence allows.

const BASE = "https://rest.api.bible/v1";
const LANGUAGES = ["eng", "tam", "hin"];

export interface ApiBible {
  id: string;
  name: string;
}

function key(): string | null {
  return process.env.API_BIBLE_KEY?.trim() || null;
}

async function call(path: string): Promise<{ data?: unknown } | null> {
  const apiKey = key();
  if (!apiKey) return null;
  try {
    const response = await fetch(`${BASE}${path}`, { headers: { "api-key": apiKey }, signal: AbortSignal.timeout(10_000), next: { revalidate: 3600 } });
    if (!response.ok) return null;
    return (await response.json()) as { data?: unknown };
  } catch {
    return null;
  }
}

let listCache: { at: number; bibles: ApiBible[] } | null = null;

/** The licensed Bibles to offer. Empty when API.Bible isn't set up. Cached for an hour. */
export async function listApiBibles(): Promise<ApiBible[]> {
  if (!key()) return [];
  if (listCache && Date.now() - listCache.at < 3_600_000) return listCache.bibles;
  const allow = (process.env.API_BIBLE_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const found = new Map<string, ApiBible>();
  for (const language of LANGUAGES) {
    const body = await call(`/bibles?language=${language}&include-full-details=false`);
    const rows = Array.isArray(body?.data) ? (body.data as { id?: string; name?: string; abbreviationLocal?: string; abbreviation?: string; language?: { id?: string } }[]) : [];
    for (const b of rows) {
      if (!b.id || !/^[0-9a-zA-Z-]+$/.test(b.id) || (allow.length > 0 && !allow.includes(b.id))) continue;
      const abbreviation = b.abbreviationLocal || b.abbreviation || "";
      found.set(b.id, { id: b.id, name: `${b.name ?? b.id}${abbreviation ? ` (${abbreviation})` : ""}` });
    }
  }
  const bibles = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Don't remember an empty answer (a hiccup shouldn't hide them for an hour).
  if (bibles.length > 0) listCache = { at: Date.now(), bibles };
  return bibles;
}

async function known(bibleId: string): Promise<boolean> {
  return (await listApiBibles()).some((b) => b.id === bibleId);
}

export async function apiBibleChapter(bibleId: string, book: number, chapter: number): Promise<{ verses: VerseLine[] } | { error: string }> {
  if (!(await known(bibleId))) return { error: "That translation isn't available." };
  const code = USFM_CODES[book - 1];
  const body = await call(`/bibles/${bibleId}/chapters/${code}.${chapter}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`);
  const content = (body?.data as { content?: string } | undefined)?.content;
  if (typeof content !== "string") return { error: `${BOOK_NAMES[book - 1]} ${chapter} couldn't be loaded from this translation. Try again, or pick another.` };
  const verses = splitNumberedVerses(content);
  return verses.length > 0 ? { verses } : { error: `${BOOK_NAMES[book - 1]} ${chapter} isn't in this translation.` };
}

export async function apiBibleSearch(bibleId: string, text: string, limit: number): Promise<{ reference: string; text: string }[] | { error: string }> {
  if (!(await known(bibleId))) return { error: "That translation isn't available." };
  const body = await call(`/bibles/${bibleId}/search?query=${encodeURIComponent(text.slice(0, 100))}&limit=${limit}&sort=relevance`);
  const verses = (body?.data as { verses?: { reference?: string; text?: string }[] } | undefined)?.verses;
  if (!Array.isArray(verses)) return { error: "Search isn't available for this translation right now." };
  return verses.filter((v) => v.reference && v.text).map((v) => ({ reference: v.reference!, text: v.text!.replace(/\s+/g, " ").trim() }));
}
