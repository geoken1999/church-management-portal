// Pure date-range/bucketing logic for the Accounting dashboard — no
// Supabase or Next.js dependency, so it's directly unit-testable and safe
// to import from a Client Component for the filter UI.

function parseDateOnly(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Monday-start week — matches how most church weekly schedules (and most
// non-US calendars) are read, and keeps Sunday services inside the week
// they were collected in rather than splitting it into "next week."
function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return addDays(date, diff);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31);
}

export const ACCOUNTING_PERIOD_PRESETS = ["today", "week", "month", "year", "custom"] as const;
export type AccountingPeriodPreset = (typeof ACCOUNTING_PERIOD_PRESETS)[number];

export const ACCOUNTING_PERIOD_LABELS: Record<AccountingPeriodPreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  custom: "Custom range",
};

export interface DateRange {
  start: string;
  end: string;
}

function isValidDateOnly(value: string | undefined): value is string {
  return Boolean(value) && !Number.isNaN(parseDateOnly(value as string).getTime());
}

export function resolvePeriodRange(
  preset: AccountingPeriodPreset,
  custom: { start?: string; end?: string } = {},
  now: Date = new Date(),
): DateRange {
  switch (preset) {
    case "today": {
      const iso = formatDateOnly(now);
      return { start: iso, end: iso };
    }
    case "week": {
      const start = startOfWeek(now);
      return { start: formatDateOnly(start), end: formatDateOnly(addDays(start, 6)) };
    }
    case "month":
      return { start: formatDateOnly(startOfMonth(now)), end: formatDateOnly(endOfMonth(now)) };
    case "year":
      return { start: formatDateOnly(startOfYear(now)), end: formatDateOnly(endOfYear(now)) };
    case "custom": {
      const start = isValidDateOnly(custom.start) ? custom.start : formatDateOnly(startOfMonth(now));
      const end = isValidDateOnly(custom.end) ? custom.end : formatDateOnly(now);
      // A reversed range (end typed before start) is swapped rather than
      // treated as empty — the person almost certainly meant a valid range.
      return start <= end ? { start, end } : { start: end, end: start };
    }
  }
}

export function daysInRange(range: DateRange): number {
  const start = parseDateOnly(range.start);
  const end = parseDateOnly(range.end);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export type BucketGranularity = "day" | "week" | "month";

// A single rule covering every preset (including custom): short ranges
// read best day-by-day, long ones need coarser buckets just to stay
// legible, regardless of which preset produced the range.
export function bucketGranularityForRange(range: DateRange): BucketGranularity {
  const days = daysInRange(range);
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

export interface AccountingBucket {
  key: string;
  label: string;
  start: string;
  end: string;
}

export function buildAccountingBuckets(range: DateRange, granularity: BucketGranularity): AccountingBucket[] {
  const rangeStart = parseDateOnly(range.start);
  const rangeEnd = parseDateOnly(range.end);
  const buckets: AccountingBucket[] = [];

  if (granularity === "day") {
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      const iso = formatDateOnly(cursor);
      buckets.push({ key: iso, label: cursor.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }), start: iso, end: iso });
      cursor = addDays(cursor, 1);
    }
  } else if (granularity === "week") {
    let cursor = startOfWeek(rangeStart);
    while (cursor <= rangeEnd) {
      const bucketEnd = addDays(cursor, 6);
      const clampedEnd = bucketEnd < rangeEnd ? bucketEnd : rangeEnd;
      buckets.push({
        key: formatDateOnly(cursor),
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start: formatDateOnly(cursor),
        end: formatDateOnly(clampedEnd),
      });
      cursor = addDays(cursor, 7);
    }
  } else {
    let cursor = startOfMonth(rangeStart);
    while (cursor <= rangeEnd) {
      const monthEnd = endOfMonth(cursor);
      const clampedEnd = monthEnd < rangeEnd ? monthEnd : rangeEnd;
      buckets.push({
        key: formatDateOnly(cursor),
        label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        start: formatDateOnly(cursor),
        end: formatDateOnly(clampedEnd),
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  return buckets;
}
