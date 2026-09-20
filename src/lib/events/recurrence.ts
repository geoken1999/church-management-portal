import type { EventRecurrenceFrequency } from "@/types/database";

export interface RecurringEventLike {
  start_at: string;
  is_recurring: boolean;
  recurrence_frequency: EventRecurrenceFrequency | null;
  recurrence_end_date: string | null;
}

export interface EventOccurrence<T extends RecurringEventLike> {
  event: T;
  date: Date;
}

// One iteration of the recurrence pattern, anchored to the event's original
// day-of-month/day-of-year so e.g. a monthly event starting Jan 31 lands on
// the next month that actually has a 31st, rather than silently rolling
// over into March the way `setMonth` would.
function step(date: Date, frequency: EventRecurrenceFrequency, anchorDay: number, anchorMonth: number): Date {
  const time = {
    h: date.getHours(),
    m: date.getMinutes(),
    s: date.getSeconds(),
    ms: date.getMilliseconds(),
  };

  if (frequency === "daily") {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (frequency === "weekly") {
    const next = new Date(date);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (frequency === "monthly") {
    // Walk forward month-by-month from the ORIGINAL cursor's year/month
    // (never from a previously rolled-over candidate — doing that let a
    // skipped Feb 31 push May's attempt to the wrong month and drift
    // forward without ever landing back on the 31st).
    let offset = 1;
    while (true) {
      const totalMonths = date.getFullYear() * 12 + date.getMonth() + offset;
      const year = Math.floor(totalMonths / 12);
      const month = totalMonths - year * 12;
      const candidate = new Date(year, month, anchorDay, time.h, time.m, time.s, time.ms);
      if (candidate.getFullYear() === year && candidate.getMonth() === month) {
        return candidate;
      }
      offset += 1;
    }
  }

  // yearly
  let offset = 1;
  while (true) {
    const year = date.getFullYear() + offset;
    const candidate = new Date(year, anchorMonth, anchorDay, time.h, time.m, time.s, time.ms);
    if (candidate.getFullYear() === year && candidate.getMonth() === anchorMonth) {
      return candidate;
    }
    offset += 1;
  }
}

const MAX_ITERATIONS = 10000;

// Expands one-time and recurring events into concrete occurrence dates
// falling within [rangeStart, rangeEnd] (inclusive). Recurrence isn't
// stored per-occurrence in the database, so this runs on every render of
// the calendar/list views against whatever range is currently visible.
export function getOccurrencesInRange<T extends RecurringEventLike>(
  events: T[],
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence<T>[] {
  const occurrences: EventOccurrence<T>[] = [];

  for (const event of events) {
    const start = new Date(event.start_at);
    if (Number.isNaN(start.getTime())) continue;

    if (!event.is_recurring || !event.recurrence_frequency) {
      if (start >= rangeStart && start <= rangeEnd) {
        occurrences.push({ event, date: start });
      }
      continue;
    }

    const recurrenceEnd = event.recurrence_end_date
      ? new Date(`${event.recurrence_end_date}T23:59:59.999`)
      : null;
    const anchorDay = start.getDate();
    const anchorMonth = start.getMonth();

    let cursor = start;
    let iterations = 0;

    while (cursor <= rangeEnd && iterations < MAX_ITERATIONS) {
      if (recurrenceEnd && cursor > recurrenceEnd) break;
      if (cursor >= rangeStart) {
        occurrences.push({ event, date: cursor });
      }
      cursor = step(cursor, event.recurrence_frequency, anchorDay, anchorMonth);
      iterations += 1;
    }
  }

  return occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function occurrenceLabel(event: RecurringEventLike): string {
  if (!event.is_recurring || !event.recurrence_frequency) return "One-time event";

  const labels: Record<EventRecurrenceFrequency, string> = {
    daily: "Repeats daily",
    weekly: "Repeats weekly",
    monthly: "Repeats monthly",
    yearly: "Repeats yearly",
  };
  const base = labels[event.recurrence_frequency];

  if (event.recurrence_end_date) {
    const end = new Date(`${event.recurrence_end_date}T00:00:00`);
    return `${base} until ${end.toLocaleDateString()}`;
  }
  return base;
}
