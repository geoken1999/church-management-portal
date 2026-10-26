import { resolveBook } from "@/lib/projection/books";
import type { ParsedVerse } from "@/lib/projection/slides";

export const MAX_IMPORT_VERSES = 40_000;

/**
 * Reads pasted Bible text, one verse per line: "John 3:16 For God so loved the world...". A line that continues the
 * previous verse (it doesn't start with a reference) is joined to it. Returns the verses and the lines it could not
 * read, so nothing is dropped silently. Pure.
 */
export function parseVerseLines(input: string): { verses: ParsedVerse[]; problems: string[] } {
  const verses: ParsedVerse[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of input.replace(/\r\n?/g, "\n").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^((?:[1-3]|i{1,3})?\s?[a-z][a-z .]*?)\s*(\d{1,3})\s*[:.]\s*(\d{1,3})\s+(.+)$/i);
    const book = match ? resolveBook(match[1]) : null;
    if (match && book) {
      const key = `${book}:${match[2]}:${match[3]}`;
      if (seen.has(key)) {
        problems.push(`Line ${index + 1}: ${match[1].trim()} ${match[2]}:${match[3]} appears twice`);
        continue;
      }
      seen.add(key);
      verses.push({ book, chapter: Number(match[2]), verse: Number(match[3]), text: match[4].trim() });
    } else if (verses.length > 0 && !/^\S+\s+\d+\s*[:.]\s*\d+/.test(line)) {
      verses[verses.length - 1].text += ` ${line}`;
    } else {
      problems.push(`Line ${index + 1}: couldn't read "${line.slice(0, 40)}"`);
    }
  }
  return { verses, problems };
}
