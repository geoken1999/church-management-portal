import type { VerseLine } from "@/lib/projection/slides";

/** USFM book codes in canonical order, as API.Bible names chapters ("JHN.3"). */
export const USFM_CODES = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG",
  "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT",
  "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
] as const;

/** Splits a chapter that has "[1] text [2] text" verse numbers into verses. Anything before the first number is dropped. Pure. */
export function splitNumberedVerses(content: string): VerseLine[] {
  const parts = content.split(/\[(\d{1,3})\]/);
  const verses: VerseLine[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = (parts[i + 1] ?? "").replace(/\s+/g, " ").trim();
    if (text) verses.push({ verse: Number(parts[i]), text });
  }
  return verses;
}
