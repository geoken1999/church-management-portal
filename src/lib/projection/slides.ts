// Turning text into the slides that go on the screen. Pure.

export type SlideKind = "bible" | "song" | "announcement" | "custom" | "presentation";

export interface Slide {
  kind: SlideKind;
  /** The reference ("John 3:16-18") or the item's title. */
  title: string;
  /** What is shown, large. */
  text: string;
  /** Small line underneath: the translation, or the slide number. */
  footer: string;
  /** A picture shown across the whole screen instead of text (a PowerPoint slide). */
  image?: string;
  /** A Bible passage in several translations at once: one entry each (name is short, e.g. "KJV"). `text` is them joined. */
  versions?: { name: string; text: string }[];
}

export interface VerseLine {
  verse: number;
  text: string;
}

/** Most translations that can be shown together on one slide. */
export const MAX_COMPARED = 4;

/** About how much fits on one slide at a readable size. */
export const MAX_SLIDE_CHARS = 260;

/** Groups consecutive verses into slides, each as long as will fit. A single verse longer than the limit gets a slide of its own. */
export function paginateVerses(verses: VerseLine[], maxChars: number = MAX_SLIDE_CHARS): VerseLine[][] {
  const pages: VerseLine[][] = [];
  let current: VerseLine[] = [];
  let length = 0;
  for (const verse of verses) {
    const size = verse.text.length + 4;
    if (current.length > 0 && length + size > maxChars) {
      pages.push(current);
      current = [];
      length = 0;
    }
    current.push(verse);
    length += size;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

/** The label for a group of verses: "John 3:16" or "John 3:16-18". */
export function pageReference(bookName: string, chapter: number, page: VerseLine[]): string {
  const first = page[0].verse;
  const last = page[page.length - 1].verse;
  return first === last ? `${bookName} ${chapter}:${first}` : `${bookName} ${chapter}:${first}-${last}`;
}

/** The text of one page: a lone verse is shown plain, several have their numbers in front. */
export function pageText(page: VerseLine[]): string {
  return page.length === 1 ? page[0].text : page.map((v) => `${v.verse} ${v.text}`).join(" ");
}

/** A song or announcement is written with a blank line between slides. */
export function splitSlides(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function itemSlides(kind: Exclude<SlideKind, "bible" | "presentation">, title: string, body: string): Slide[] {
  const parts = splitSlides(body);
  return parts.map((text, i) => ({ kind, title, text, footer: parts.length > 1 ? `${i + 1} / ${parts.length}` : "" }));
}

/** A presentation's slides: each is a picture, with the slide's own text kept for reading aloud and for the app. */
export function presentationSlides(title: string, images: { url: string; text: string }[]): Slide[] {
  return images.map((image, i) => ({
    kind: "presentation" as const,
    title,
    text: image.text.trim() || `Slide ${i + 1}`,
    footer: `${i + 1} / ${images.length}`,
    image: image.url,
  }));
}

/** Lines of the form "John 3:16 For God so loved..." for a church's own translation. */
export interface ParsedVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}
