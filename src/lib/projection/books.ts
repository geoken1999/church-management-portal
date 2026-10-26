// The 66 books of the Bible, in canonical order, with the short forms people type. Pure.

export const BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
] as const;

/** Forms that are not a unique beginning of the name, so a prefix match alone would be wrong or ambiguous. Keys have no spaces or dots. */
const ALIASES: Record<string, number> = {
  gn: 1, ge: 1, ex: 2, exo: 2, lv: 3, le: 3, nm: 4, nu: 4, dt: 5, de: 5, jos: 6, jsh: 6, jg: 7, jdg: 7, judg: 7, rt: 8, ru: 8,
  "1sm": 9, "1sa": 9, "2sm": 10, "2sa": 10, "1ki": 11, "1kgs": 11, "2ki": 12, "2kgs": 12, "1ch": 13, "1chr": 13, "2ch": 14, "2chr": 14,
  ne: 16, est: 17, jb: 18, ps: 19, psa: 19, psalm: 19, pr: 20, prv: 20, pro: 20, ec: 21, ecc: 21, song: 22, sos: 22, ss: 22, songofsongs: 22,
  is: 23, isa: 23, jer: 24, jr: 24, la: 25, lam: 25, eze: 26, ez: 26, dn: 27, dan: 27, ho: 28, hos: 28, jl: 29, joe: 29, am: 30, ob: 31, oba: 31,
  jon: 32, jnh: 32, mi: 33, mic: 33, na: 34, nah: 34, hab: 35, zep: 36, zph: 36, hag: 37, hg: 37, zec: 38, zch: 38, mal: 39,
  mt: 40, mat: 40, matt: 40, mk: 41, mr: 41, mar: 41, lk: 42, luk: 42, jn: 43, joh: 43, ac: 44, act: 44, ro: 45, rom: 45, rm: 45,
  "1co": 46, "1cor": 46, "2co": 47, "2cor": 47, ga: 48, gal: 48, eph: 49, php: 50, phil: 50, pp: 50, col: 51, "1th": 52, "1thess": 52,
  "2th": 53, "2thess": 53, "1ti": 54, "1tim": 54, "2ti": 55, "2tim": 55, tit: 56, ti: 56, phm: 57, phlm: 57, philem: 57, he: 58, heb: 58,
  jas: 59, jm: 59, "1pe": 60, "1pet": 60, "2pe": 61, "2pet": 61, "1jn": 62, "1jo": 62, "1john": 62, "2jn": 63, "2jo": 63, "2john": 63,
  "3jn": 64, "3jo": 64, "3john": 64, jud: 65, jde: 65, jude: 65, re: 66, rev: 66, revelation: 66, apocalypse: 66,
};

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/^(i{1,3})(?=\s*[a-z])/, (m) => String(m.length)) // I, II, III John
    .replace(/[\s.]/g, "");

const NORMAL_NAMES = BOOK_NAMES.map((name) => normalise(name));

/** The book (1-66) a typed name means, or null when it matches nothing or more than one ("jo" could be Job or John). */
export function resolveBook(input: string): number | null {
  const key = normalise(input);
  if (!key) return null;
  const exact = NORMAL_NAMES.indexOf(key);
  if (exact >= 0) return exact + 1;
  if (key in ALIASES) return ALIASES[key];
  const matches = NORMAL_NAMES.map((name, i) => (name.startsWith(key) ? i + 1 : 0)).filter(Boolean);
  return matches.length === 1 ? matches[0] : null;
}
