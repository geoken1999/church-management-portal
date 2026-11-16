// Pure date-matching logic, deliberately free of "server-only" / DB
// imports so it's directly unit-testable (vitest can't resolve the
// "server-only" package, which eligibility.ts and send.ts otherwise need).
// src/lib/organizations/timezone.ts is likewise "server-only"-free, so
// importing it here doesn't break that.

import { partsInTimezone, dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";

// "Today" in the given org's own timezone — previously hardcoded to
// Asia/Kolkata for every org (every date-sensitive cron in this app used
// to assume IST, since no per-org timezone column existed at all).
export function todayInTimezone(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): { year: number; month: number; day: number } {
  const { year, month, day } = partsInTimezone(now, timeZone);
  return { year, month, day };
}

export function dateKeyInOrgTimezone(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  return dateKeyInTimezone(now, timeZone);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Shifts "today" forward by daysOffset and returns the (month, day) to
// match against member dates, with year discarded — a trigger only ever
// cares about month/day recurring annually. Real calendar dates never
// land ON Feb 29 in a non-leap year (JS Date normalizes that to Mar 1),
// so the leap-day policy can't be applied by adjusting the target here —
// it has to work the other way: when the target resolves to Feb 28 in a
// non-leap year, also treat a member's Feb 29 date as a match (the
// simplest defensible policy: "Feb 29 birthdays fire on Feb 28"). See
// matchFeb29Day below, which matchesMonthDay() uses for that.
export function resolveTargetMonthDay(
  today: { year: number; month: number; day: number },
  daysOffset: number,
): { month: number; day: number; occurrenceYear: number; matchFeb29Day: boolean } {
  const base = new Date(Date.UTC(today.year, today.month - 1, today.day));
  base.setUTCDate(base.getUTCDate() + daysOffset);
  const targetYear = base.getUTCFullYear();
  const targetMonth = base.getUTCMonth() + 1;
  const targetDay = base.getUTCDate();

  return {
    month: targetMonth,
    day: targetDay,
    occurrenceYear: targetYear,
    matchFeb29Day: targetMonth === 2 && targetDay === 28 && !isLeapYear(targetYear),
  };
}

export function matchesMonthDay(dateString: string | null, month: number, day: number, matchFeb29Day = false): boolean {
  if (!dateString) return false;
  // date_of_birth/wedding_date/custom date fields are stored as plain
  // "YYYY-MM-DD" — parsed as UTC-anchored to avoid a local-timezone
  // off-by-one on the day component.
  const parsed = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const parsedMonth = parsed.getUTCMonth() + 1;
  const parsedDay = parsed.getUTCDate();
  if (parsedMonth === month && parsedDay === day) return true;
  return matchFeb29Day && parsedMonth === 2 && parsedDay === 29;
}

export function buildDirectIdempotencyKey(triggerId: string, memberId: string, occurrenceYear: number): string {
  return `direct:${triggerId}:${memberId}:${occurrenceYear}`;
}

export function buildDigestIdempotencyKey(automationId: string, now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  return `digest:${automationId}:${dateKeyInOrgTimezone(now, timeZone)}`;
}

// Meta rejects a template parameter containing newlines, tabs or 4+
// consecutive spaces (error 132018), so entries are joined inline.
export const CELEBRANT_SEPARATOR = "; ";

export function buildCelebrantList(celebrants: { name: string; occasionLabel: string }[], maxLines = 30): string {
  const lines = celebrants.map((c) => `${c.name} — ${c.occasionLabel}`);
  if (lines.length <= maxLines) return lines.join(CELEBRANT_SEPARATOR);
  const shown = lines.slice(0, maxLines);
  return `${shown.join(CELEBRANT_SEPARATOR)}${CELEBRANT_SEPARATOR}...and ${lines.length - maxLines} more`;
}

// Staff digest recipients are picked from the org's leaders, capped here.
export const MAX_DIGEST_LEADERS = 3;

// ---- The weekly summary (Sunday morning) ----------------------------------------------------------------------------------------------------
// Sent once a week to the same leaders as the daily digest: everything special in the seven days that start today (Sunday to Saturday).

/** True when it is Sunday, on the calendar of the church's own timezone. */
export function isSundayInTimezone(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): boolean {
  const today = todayInTimezone(now, timeZone);
  return new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() === 0;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 17 Nov": the calendar day `offset` days after `today`. */
export function weekDayLabel(today: { year: number; month: number; day: number }, offset: number): string {
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day));
  d.setUTCDate(d.getUTCDate() + offset);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface WeeklyEntry {
  /** 0 is today (the Sunday), 6 is the Saturday. */
  offset: number;
  name: string;
  occasionLabel: string;
}

// WhatsApp refuses a template parameter longer than 1024 characters, so the list is cut well short of that and says how many more there are.
export const WEEKLY_LIST_MAX_CHARS = 900;

/**
 * One line of text for the template's {{celebrant_list}}: days in order, each with who is celebrating what, for example
 * "Sun 16 Nov: Priya Nair — Birthday; Wed 19 Nov: Thomas & Anjali — Wedding Anniversary, Mary Joseph — Birthday".
 * No newlines (Meta rejects them). Entries that would not fit are left out and counted: "...and 4 more".
 */
export function buildWeeklyCelebrantList(
  today: { year: number; month: number; day: number },
  entries: WeeklyEntry[],
  maxChars: number = WEEKLY_LIST_MAX_CHARS,
): string {
  const sorted = [...entries].sort((a, b) => a.offset - b.offset || a.name.localeCompare(b.name));
  const days = new Map<number, string[]>();
  for (const e of sorted) days.set(e.offset, [...(days.get(e.offset) ?? []), `${e.name} — ${e.occasionLabel}`]);

  const groups: { text: string; count: number }[] = [...days.entries()].map(([offset, people]) => ({ text: `${weekDayLabel(today, offset)}: ${people.join(", ")}`, count: people.length }));
  const total = sorted.length;
  let out = "";
  let shown = 0;
  for (const g of groups) {
    const next = out ? `${out}${CELEBRANT_SEPARATOR}${g.text}` : g.text;
    if (next.length > maxChars) break;
    out = next;
    shown += g.count;
  }
  if (shown === total) return out;
  if (!out) {
    // Even the first day alone is too long: keep what fits of it.
    const first = groups[0]!;
    const room = Math.max(0, maxChars - 20);
    out = first.text.length > room ? `${first.text.slice(0, room).replace(/[,;\s—-]+$/, "")}...` : first.text;
  }
  return `${out}${CELEBRANT_SEPARATOR}...and ${Math.max(1, total - shown)} more`;
}

export function buildWeeklyIdempotencyKey(automationId: string, now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  return `weekly:${automationId}:${dateKeyInOrgTimezone(now, timeZone)}`;
}
