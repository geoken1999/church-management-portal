import { describe, it, expect } from "vitest";
import { splitNumberedVerses, USFM_CODES } from "./verse-text";
import { BOOK_NAMES } from "./books";

describe("splitNumberedVerses", () => {
  it("splits on [n] markers across paragraphs", () => {
    expect(splitNumberedVerses("[1] In the beginning.\n[2] The earth  was empty. [3] Light.")).toEqual([
      { verse: 1, text: "In the beginning." },
      { verse: 2, text: "The earth was empty." },
      { verse: 3, text: "Light." },
    ]);
  });
  it("returns nothing without verse numbers", () => {
    expect(splitNumberedVerses("Just words")).toEqual([]);
  });
});

describe("USFM codes", () => {
  it("has one per book", () => {
    expect(USFM_CODES).toHaveLength(BOOK_NAMES.length);
    expect(USFM_CODES[42]).toBe("JHN");
  });
});
