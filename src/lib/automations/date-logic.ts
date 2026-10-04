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

export function buildCelebrantList(celebrants: { name: string; occasionLabel: string }[], maxLines = 30): string {
  const lines = celebrants.map((c) => `${c.name} — ${c.occasionLabel}`);
  if (lines.length <= maxLines) return lines.join("\n");
  const shown = lines.slice(0, maxLines);
  return `${shown.join("\n")}\n...and ${lines.length - maxLines} more`;
}
