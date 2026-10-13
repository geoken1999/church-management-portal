// What goes into a monthly church report, and how its month is worked out. Pure, so
// the generator, the page that shows it and the tests agree.

export const MONTHLY_SECTIONS = [
  { key: "members", label: "Members", tab: "members" },
  { key: "attendance", label: "Attendance", tab: "attendance" },
  { key: "events", label: "Events", tab: "events" },
  { key: "giving", label: "Giving (offerings and donations)", tab: "offerings" },
  { key: "expenses", label: "Expenses and balance", tab: "accounting" },
  { key: "volunteers", label: "Volunteers", tab: "volunteers" },
  { key: "prayer", label: "Prayer requests", tab: "prayer" },
] as const;

export type MonthlySectionKey = (typeof MONTHLY_SECTIONS)[number]["key"];

export const SECTION_KEYS: MonthlySectionKey[] = MONTHLY_SECTIONS.map((s) => s.key);

export function isSectionKey(value: unknown): value is MonthlySectionKey {
  return typeof value === "string" && (SECTION_KEYS as string[]).includes(value);
}

/** "YYYY-MM" for a date's month. */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** First day of the month and first day of the next, as "YYYY-MM-DD" (for date columns). */
export function periodDateRange(period: string): { from: string; toExclusive: string } {
  const [year, month] = period.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return {
    from: `${period}-01`,
    toExclusive: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`,
  };
}

/** A month that has not finished yet can't be reported on. */
export function isFinishedMonth(period: string, now: Date): boolean {
  const { toExclusive } = periodDateRange(period);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` >= toExclusive;
}

export type ReportKind = "monthly" | "annual";
export type ReportLanguage = "en" | "ta" | "hi";
export const REPORT_LANGUAGES: { value: ReportLanguage; label: string; locale: string }[] = [
  { value: "en", label: "English", locale: "en-IN" },
  { value: "ta", label: "தமிழ் (Tamil)", locale: "ta-IN" },
  { value: "hi", label: "हिन्दी (Hindi)", locale: "hi-IN" },
];
export function isReportLanguage(value: unknown): value is ReportLanguage {
  return value === "en" || value === "ta" || value === "hi";
}
export const localeOf = (language: ReportLanguage) => REPORT_LANGUAGES.find((l) => l.value === language)?.locale ?? "en-IN";

export type ReportTone = "warm" | "formal" | "brief";
export const REPORT_TONES: { value: ReportTone; label: string; hint: string }[] = [
  { value: "warm", label: "Warm", hint: "Like a pastor's letter to the church" },
  { value: "formal", label: "Formal", hint: "For a board or leadership report" },
  { value: "brief", label: "Brief", hint: "Just the key points" },
];
export const isReportTone = (value: unknown): value is ReportTone => value === "warm" || value === "formal" || value === "brief";

export interface Letterhead {
  churchName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export interface ReportPhoto {
  path: string;
  caption: string;
}

export const MAX_REPORT_PHOTOS = 12;

export const isYear = (value: unknown): boolean => typeof value === "string" && /^\d{4}$/.test(value);

export interface MonthlyReportData {
  kind?: ReportKind;
  language?: ReportLanguage;
  period: string;
  label: string;
  generatedAt: string;
  sections: MonthlySectionKey[];
  // Headings and captions in the report's language, saved with it so every screen shows the same words.
  labels?: Record<string, string>;
  branchName?: string | null;
  letterhead?: Letterhead;
  logoUrl?: string | null;
  // An AI-written summary of the figures, in the report's language.
  narrative?: { text: string; highlights: string[]; sections?: Partial<Record<MonthlySectionKey, string>> } | null;
  photos?: ReportPhoto[];
  // Annual reports: giving and expenses month by month.
  byMonth?: { month: string; giving: number; expenses: number }[];
  members?: { total: number; joined: number };
  attendance?: { services: number; total: number; average: number; best: { title: string; date: string; dateLabel?: string; count: number } | null };
  events?: { held: number; list: { title: string; date: string; dateLabel?: string }[] };
  giving?: { offerings: number; donations: number; total: number; byCategory: { name: string; amount: number }[] };
  expenses?: { expenses: number; income: number; balance: number };
  volunteers?: { active: number; joined: number };
  prayer?: { received: number; answered: number };
}

/** Rounds money to paise so sums don't carry floating-point dust. */
export const money = (n: number) => Math.round(n * 100) / 100;

/** The first and last month of a year, as period strings, and the year as a date range. */
export function yearDateRange(year: string): { from: string; toExclusive: string } {
  return { from: `${year}-01-01`, toExclusive: `${Number(year) + 1}-01-01` };
}

/** The range a report covers, whether it is for a month or a year. */
export function rangeOf(period: string): { from: string; toExclusive: string } {
  return isYear(period) ? yearDateRange(period) : periodDateRange(period);
}

/** A year can be reported on once it has finished; a month once the month is over. */
export function isFinishedPeriod(period: string, now: Date): boolean {
  if (isYear(period)) return now.getFullYear() > Number(period);
  return isFinishedMonth(period, now);
}

export function isPeriodOfKind(kind: ReportKind, value: unknown): value is string {
  return kind === "annual" ? isYear(value) : isPeriod(value);
}

export function periodLabelIn(period: string, language: ReportLanguage): string {
  if (isYear(period)) return period;
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(localeOf(language), { month: "long", year: "numeric", timeZone: "UTC" });
}

export function dateLabelIn(iso: string, language: ReportLanguage): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(localeOf(language), { day: "numeric", month: "short", timeZone: "UTC" });
}

// A full date (13 October 2026) in the report's language.
export function fullDateIn(iso: string, language: ReportLanguage): string {
  return new Date(iso).toLocaleDateString(localeOf(language), { day: "numeric", month: "long", year: "numeric" });
}

export function monthShortIn(period: string, language: ReportLanguage): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(localeOf(language), { month: "short", timeZone: "UTC" });
}

// Words the report uses, in each language. Saved into every report as it is made.
const LABELS: Record<ReportLanguage, Record<string, string>> = {
  en: {
    titleMonthly: "Monthly church report", titleAnnual: "Annual church report", members: "Members", onRecord: "On record", joinedMonth: "Joined this month", joinedYear: "Joined this year",
    attendance: "Attendance", services: "Services recorded", average: "Average per service", totalAttendance: "Total attendance", best: "Best attended",
    giving: "Giving", offerings: "Offerings", donations: "Donations", total: "Total", expensesBalance: "Expenses and balance", givingReceived: "Giving received", expenses: "Expenses", leftOver: "Left over",
    events: "Events", eventsHeld: "Events held", volunteers: "Volunteers", active: "Active", prayer: "Prayer requests", received: "Received", answered: "Answered",
    byMonth: "Month by month", photos: "Photos", summary: "Summary", highlights: "Highlights", wholeChurch: "Whole church", branch: "Branch", madeOn: "Made on",
    donationsNote: "Donations aren't recorded per branch, so they are not included in this branch report.", aiNote: "Summary written by AI from the figures in this report.",
  },
  ta: {
    titleMonthly: "மாதாந்திர சபை அறிக்கை", titleAnnual: "ஆண்டு சபை அறிக்கை", members: "உறுப்பினர்கள்", onRecord: "பதிவில் உள்ளவர்கள்", joinedMonth: "இந்த மாதம் சேர்ந்தவர்கள்", joinedYear: "இந்த ஆண்டு சேர்ந்தவர்கள்",
    attendance: "வருகை", services: "பதிவான ஆராதனைகள்", average: "ஆராதனைக்கு சராசரி", totalAttendance: "மொத்த வருகை", best: "அதிக வருகை",
    giving: "கொடுப்பனவுகள்", offerings: "காணிக்கை", donations: "நன்கொடைகள்", total: "மொத்தம்", expensesBalance: "செலவுகளும் இருப்பும்", givingReceived: "பெற்ற கொடுப்பனவுகள்", expenses: "செலவுகள்", leftOver: "மீதம்",
    events: "நிகழ்வுகள்", eventsHeld: "நடந்த நிகழ்வுகள்", volunteers: "தொண்டர்கள்", active: "செயலில் உள்ளவர்கள்", prayer: "ஜெப வேண்டுதல்கள்", received: "பெறப்பட்டவை", answered: "பதிலளிக்கப்பட்டவை",
    byMonth: "மாதவாரியாக", photos: "புகைப்படங்கள்", summary: "சுருக்கம்", highlights: "முக்கிய அம்சங்கள்", wholeChurch: "முழு சபை", branch: "கிளை", madeOn: "தயாரிக்கப்பட்ட நாள்",
    donationsNote: "நன்கொடைகள் கிளை வாரியாகப் பதிவு செய்யப்படுவதில்லை, எனவே இந்தக் கிளை அறிக்கையில் சேர்க்கப்படவில்லை.", aiNote: "இந்த அறிக்கையின் புள்ளிவிவரங்களிலிருந்து AI எழுதிய சுருக்கம்.",
  },
  hi: {
    titleMonthly: "मासिक चर्च रिपोर्ट", titleAnnual: "वार्षिक चर्च रिपोर्ट", members: "सदस्य", onRecord: "रिकॉर्ड में", joinedMonth: "इस महीने जुड़े", joinedYear: "इस वर्ष जुड़े",
    attendance: "उपस्थिति", services: "दर्ज की गई आराधनाएँ", average: "प्रति आराधना औसत", totalAttendance: "कुल उपस्थिति", best: "सबसे अधिक उपस्थिति",
    giving: "दान और भेंट", offerings: "भेंट", donations: "दान", total: "कुल", expensesBalance: "खर्च और शेष", givingReceived: "प्राप्त दान और भेंट", expenses: "खर्च", leftOver: "शेष",
    events: "कार्यक्रम", eventsHeld: "आयोजित कार्यक्रम", volunteers: "स्वयंसेवक", active: "सक्रिय", prayer: "प्रार्थना अनुरोध", received: "प्राप्त", answered: "उत्तरित",
    byMonth: "महीने के अनुसार", photos: "तस्वीरें", summary: "सारांश", highlights: "मुख्य बातें", wholeChurch: "पूरा चर्च", branch: "शाखा", madeOn: "बनाई गई तिथि",
    donationsNote: "दान शाखा के अनुसार दर्ज नहीं किए जाते, इसलिए इस शाखा रिपोर्ट में शामिल नहीं हैं।", aiNote: "इस रिपोर्ट के आँकड़ों से AI द्वारा लिखा गया सारांश।",
  },
};

export const reportLabels = (language: ReportLanguage) => LABELS[language];

// Starting points for a report. A church can also save its own (report_templates).
export interface ReportTemplateConfig {
  kind?: ReportKind;
  sections: MonthlySectionKey[];
  language: ReportLanguage;
  ai: boolean;
  tone: ReportTone;
  note: string;
  letterhead: Letterhead;
}

export const EMPTY_LETTERHEAD: Letterhead = { churchName: "", address: "", phone: "", email: "", website: "" };

export const BUILT_IN_TEMPLATES: { id: string; name: string; description: string; config: Omit<ReportTemplateConfig, "letterhead" | "note"> }[] = [
  { id: "builtin-full", name: "Full report", description: "Every section, with a warm AI summary", config: { sections: SECTION_KEYS, language: "en", ai: true, tone: "warm" } },
  { id: "builtin-leadership", name: "Leadership report", description: "Figures for the church's leaders, in a formal tone", config: { sections: ["members", "attendance", "events", "giving", "expenses"], language: "en", ai: true, tone: "formal" } },
  { id: "builtin-members", name: "Report for members", description: "A short, friendly report without the accounts", config: { sections: ["members", "attendance", "events", "volunteers", "prayer"], language: "en", ai: true, tone: "warm" } },
  { id: "builtin-figures", name: "Figures only", description: "Just the numbers, no AI summary", config: { sections: SECTION_KEYS, language: "en", ai: false, tone: "brief" } },
];
