import { BOOK_NAMES, resolveBook } from "@/lib/projection/books";

// What a person types to find a passage: "John 3:16", "jn 3:16-18", "1 cor 13", "Ps 23". Pure.

export interface PassageRef {
  /** 1-66 */
  book: number;
  chapter: number;
  /** First verse; 1 when the whole chapter is meant. */
  from: number;
  /** Last verse; null means to the end of the chapter. */
  to: number | null;
}

/** Null when the text isn't a reference. */
export function parseReference(input: string): PassageRef | null {
  const text = input.trim().replace(/\s+/g, " ");
  // book name (may start with a number), chapter, optional :verse and optional -verse
  const match = text.match(/^((?:[1-3]|i{1,3})?\s?[a-z][a-z .]*?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?$/i);
  if (!match) return null;
  const book = resolveBook(match[1]);
  if (!book) return null;
  const chapter = Number(match[2]);
  if (chapter < 1) return null;
  if (match[3] === undefined) return { book, chapter, from: 1, to: null };
  const from = Number(match[3]);
  const to = match[4] === undefined ? from : Number(match[4]);
  if (from < 1 || to < from) return null;
  return { book, chapter, from, to };
}

/** "John 3:16-18", "Psalms 23" */
export function formatReference(ref: PassageRef, lastVerse?: number): string {
  const name = BOOK_NAMES[ref.book - 1];
  if (ref.to === null && ref.from === 1 && lastVerse === undefined) return `${name} ${ref.chapter}`;
  const to = ref.to ?? lastVerse ?? ref.from;
  return to === ref.from ? `${name} ${ref.chapter}:${ref.from}` : `${name} ${ref.chapter}:${ref.from}-${to}`;
}
