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

export interface MonthlyReportData {
  period: string;
  label: string;
  generatedAt: string;
  sections: MonthlySectionKey[];
  members?: { total: number; joined: number };
  attendance?: { services: number; total: number; average: number; best: { title: string; date: string; count: number } | null };
  events?: { held: number; list: { title: string; date: string }[] };
  giving?: { offerings: number; donations: number; total: number; byCategory: { name: string; amount: number }[] };
  expenses?: { expenses: number; income: number; balance: number };
  volunteers?: { active: number; joined: number };
  prayer?: { received: number; answered: number };
}

/** Rounds money to paise so sums don't carry floating-point dust. */
export const money = (n: number) => Math.round(n * 100) / 100;
