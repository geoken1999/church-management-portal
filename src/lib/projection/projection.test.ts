import { describe, expect, it } from "vitest";
import { resolveBook } from "@/lib/projection/books";
import { formatReference, parseReference } from "@/lib/projection/reference";
import { itemSlides, pageReference, pageText, paginateVerses, splitSlides } from "@/lib/projection/slides";
import { parseVerseLines } from "@/lib/projection/import";

describe("resolveBook", () => {
  it("knows full names, short forms and unique beginnings", () => {
    expect(resolveBook("John")).toBe(43);
    expect(resolveBook("jn")).toBe(43);
    expect(resolveBook("Jhn")).toBe(null);
    expect(resolveBook("gen")).toBe(1);
    expect(resolveBook("Ps")).toBe(19);
    expect(resolveBook("rev")).toBe(66);
    expect(resolveBook("song of solomon")).toBe(22);
  });
  it("handles numbered books in every common spelling", () => {
    expect(resolveBook("1 Cor")).toBe(46);
    expect(resolveBook("1cor")).toBe(46);
    expect(resolveBook("II Corinthians")).toBe(47);
    expect(resolveBook("3 john")).toBe(64);
    expect(resolveBook("1 Sam")).toBe(9);
  });
  it("refuses what is ambiguous or unknown", () => {
    expect(resolveBook("jo")).toBe(null); // Job, Joel, John, Jonah, Joshua
    expect(resolveBook("xyz")).toBe(null);
    expect(resolveBook("")).toBe(null);
  });
});

describe("parseReference", () => {
  it("reads a verse, a range and a whole chapter", () => {
    expect(parseReference("John 3:16")).toEqual({ book: 43, chapter: 3, from: 16, to: 16 });
    expect(parseReference("jn 3:16-18")).toEqual({ book: 43, chapter: 3, from: 16, to: 18 });
    expect(parseReference("Psalm 23")).toEqual({ book: 19, chapter: 23, from: 1, to: null });
    expect(parseReference("1 cor 13:4–7")).toEqual({ book: 46, chapter: 13, from: 4, to: 7 });
  });
  it("is null for what isn't a reference", () => {
    expect(parseReference("love")).toBe(null);
    expect(parseReference("John")).toBe(null);
    expect(parseReference("John 3:18-16")).toBe(null);
    expect(parseReference("Nowhere 3:16")).toBe(null);
  });
  it("formats it back", () => {
    expect(formatReference({ book: 43, chapter: 3, from: 16, to: 16 })).toBe("John 3:16");
    expect(formatReference({ book: 43, chapter: 3, from: 16, to: 18 })).toBe("John 3:16-18");
    expect(formatReference({ book: 19, chapter: 23, from: 1, to: null })).toBe("Psalms 23");
  });
});

describe("slides", () => {
  const verses = [1, 2, 3, 4].map((verse) => ({ verse, text: "x".repeat(100) }));
  it("fills a slide with as many verses as fit and starts another", () => {
    const pages = paginateVerses(verses, 260);
    expect(pages.map((p) => p.length)).toEqual([2, 2]);
    expect(paginateVerses([{ verse: 1, text: "y".repeat(500) }], 260)).toHaveLength(1);
    expect(paginateVerses([], 260)).toEqual([]);
  });
  it("labels and writes a page", () => {
    const [first] = paginateVerses(verses, 260);
    expect(pageReference("John", 3, first)).toBe("John 3:1-2");
    expect(pageText([{ verse: 16, text: "For God" }])).toBe("For God");
    expect(pageText(first).startsWith("1 xxx")).toBe(true);
    expect(pageReference("John", 3, [{ verse: 16, text: "a" }])).toBe("John 3:16");
  });
  it("splits a song on blank lines", () => {
    expect(splitSlides("Verse one\nline two\n\n\nChorus\r\n\r\n  Verse two  ")).toEqual(["Verse one\nline two", "Chorus", "Verse two"]);
    const slides = itemSlides("song", "Amazing Grace", "A\n\nB");
    expect(slides.map((s) => s.footer)).toEqual(["1 / 2", "2 / 2"]);
    expect(itemSlides("announcement", "Camp", "Only one")[0].footer).toBe("");
  });
});

describe("parseVerseLines", () => {
  it("reads one verse per line and joins a continuation line", () => {
    const { verses, problems } = parseVerseLines("John 3:16 For God so loved\nthe world.\nJohn 3:17 For God sent not\n\nGen 1:1 In the beginning");
    expect(problems).toEqual([]);
    expect(verses).toEqual([
      { book: 43, chapter: 3, verse: 16, text: "For God so loved the world." },
      { book: 43, chapter: 3, verse: 17, text: "For God sent not" },
      { book: 1, chapter: 1, verse: 1, text: "In the beginning" },
    ]);
  });
  it("reports what it cannot read and duplicates, without dropping silently", () => {
    const { verses, problems } = parseVerseLines("Nowhere 1:1 text\nJohn 3:16 a\nJohn 3:16 b");
    expect(verses).toHaveLength(1);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("Line 1");
    expect(problems[1]).toContain("appears twice");
  });
});
