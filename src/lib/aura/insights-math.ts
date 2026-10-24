// The arithmetic behind Aura's church insights: plain functions with no database or server code, so the
// rules (who counts as "slipping away", what counts as a trend) are written once and tested.

export interface SessionAttendance {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Who was expected at this session (its branch's members). */
  rosterIds: Set<string>;
  attendedIds: Set<string>;
}

export interface MissedStreak {
  memberId: string;
  /** Consecutive recent sessions they were expected at and missed, counting back from the newest. */
  misses: number;
  /** Date of the newest session they attended in the window, or null if none. */
  lastAttended: string | null;
}

/**
 * Members who missed [need] or more sessions in a row. Sessions are newest first. A session a member wasn't
 * expected at (another branch) is skipped, and any attendance ends the streak.
 */
export function missedInARow(sessionsNewestFirst: SessionAttendance[], need: number): MissedStreak[] {
  const members = new Set<string>();
  for (const s of sessionsNewestFirst) for (const id of s.rosterIds) members.add(id);

  const result: MissedStreak[] = [];
  for (const memberId of members) {
    let misses = 0;
    let lastAttended: string | null = null;
    let streakOpen = true;
    for (const s of sessionsNewestFirst) {
      if (!s.rosterIds.has(memberId) && !s.attendedIds.has(memberId)) continue;
      if (s.attendedIds.has(memberId)) {
        lastAttended = lastAttended ?? s.date;
        streakOpen = false;
        break;
      }
      if (streakOpen) misses += 1;
    }
    if (misses >= need) result.push({ memberId, misses, lastAttended });
  }
  return result.sort((a, b) => b.misses - a.misses);
}

export interface Trend {
  recentAverage: number;
  previousAverage: number;
  /** Percent change from the earlier half to the recent half; null when the earlier half is zero. */
  changePercent: number | null;
  direction: "up" | "down" | "steady";
}

/** Splits a newest-first series in two and compares the halves. Needs at least 4 values. */
export function trendOf(valuesNewestFirst: number[]): Trend | null {
  if (valuesNewestFirst.length < 4) return null;
  const half = Math.floor(valuesNewestFirst.length / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const recentAverage = avg(valuesNewestFirst.slice(0, half));
  const previousAverage = avg(valuesNewestFirst.slice(half, half * 2));
  const changePercent = previousAverage === 0 ? null : ((recentAverage - previousAverage) / previousAverage) * 100;
  const direction = changePercent === null ? "steady" : changePercent >= 5 ? "up" : changePercent <= -5 ? "down" : "steady";
  return {
    recentAverage: Math.round(recentAverage * 10) / 10,
    previousAverage: Math.round(previousAverage * 10) / 10,
    changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10,
    direction,
  };
}

/** Sums amounts by YYYY-MM for the last [count] months ending at [now], oldest first, with months that had nothing as 0. */
export function monthlyTotals(rows: { date: string; amount: number }[], now: Date, count: number): { month: string; total: number }[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const sums = new Map(months.map((m) => [m, 0]));
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (sums.has(key)) sums.set(key, (sums.get(key) ?? 0) + Number(row.amount));
  }
  return months.map((month) => ({ month, total: Math.round((sums.get(month) ?? 0) * 100) / 100 }));
}

export interface Celebration {
  memberId: string;
  kind: "birthday" | "anniversary";
  /** YYYY-MM-DD of the next time it falls. */
  date: string;
  daysAway: number;
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Birthdays and wedding anniversaries in the next [days] days (today counts). 29 February falls on 28 February in other years. */
export function upcomingCelebrations(
  members: { id: string; date_of_birth: string | null; wedding_date: string | null }[],
  today: string,
  days: number,
): Celebration[] {
  const [ty, tm, td] = today.split("-").map(Number);
  const start = Date.UTC(ty, tm - 1, td);
  const out: Celebration[] = [];
  const next = (iso: string | null): { date: string; daysAway: number } | null => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const month = Number(iso.slice(5, 7));
    const day = Number(iso.slice(8, 10));
    for (const year of [ty, ty + 1]) {
      const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
      const when = Date.UTC(year, month - 1, d);
      const daysAway = Math.round((when - start) / 86_400_000);
      if (daysAway >= 0) return { date: new Date(when).toISOString().slice(0, 10), daysAway };
    }
    return null;
  };
  for (const m of members) {
    for (const [kind, iso] of [["birthday", m.date_of_birth], ["anniversary", m.wedding_date]] as const) {
      const n = next(iso);
      if (n && n.daysAway <= days) out.push({ memberId: m.id, kind, date: n.date, daysAway: n.daysAway });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

export type Severity = "ok" | "watch" | "act";

export interface Signal {
  area: string;
  severity: Severity;
  /** One plain sentence with the number in it. */
  finding: string;
  /** What a leader could do about it. */
  suggestion?: string;
}

const ORDER: Record<Severity, number> = { act: 0, watch: 1, ok: 2 };

/** Most urgent first, keeping the original order within a severity. */
export function rankSignals(signals: Signal[]): Signal[] {
  return signals.map((s, i) => ({ s, i })).sort((a, b) => ORDER[a.s.severity] - ORDER[b.s.severity] || a.i - b.i).map((x) => x.s);
}
