// The arithmetic behind the module health screens: no database or server code, so it is tested on its own.

export interface ActivityRow {
  organizationId: string;
  /** ISO timestamp or YYYY-MM-DD. */
  date: string;
}

export interface ActivitySummary {
  last7: number;
  last30: number;
  /** The 30 days before the last 30: what "last 30" is compared with. */
  prev30: number;
  /** Counts per 7-day window, oldest first, the last entry being the newest 7 days. */
  weekly: number[];
  /** Counts per day for the last 30 days, oldest first. */
  daily: number[];
  /** Churches with at least one entry in the last 30 days, and how many each has. */
  last30ByChurch: Map<string, number>;
  /** Churches that have ever had one. */
  churchesEver: Set<string>;
}

const DAY = 86_400_000;

function dayStart(value: string): number | null {
  const t = value.length === 10 ? Date.parse(`${value}T00:00:00Z`) : Date.parse(value);
  if (Number.isNaN(t)) return null;
  return Math.floor(t / DAY) * DAY;
}

/** Buckets rows into the last [weeks] weeks and the last 30 days, counting back from [now] (today counts). */
export function summarizeActivity(rows: ActivityRow[], now: Date, weeks = 12): ActivitySummary {
  const today = Math.floor(now.getTime() / DAY) * DAY;
  const weekly = new Array<number>(weeks).fill(0);
  const daily = new Array<number>(30).fill(0);
  const last30ByChurch = new Map<string, number>();
  const churchesEver = new Set<string>();
  let last7 = 0;
  let last30 = 0;
  let prev30 = 0;

  for (const row of rows) {
    churchesEver.add(row.organizationId);
    const day = dayStart(row.date);
    if (day === null) continue;
    const age = Math.round((today - day) / DAY); // 0 = today
    if (age < 0) continue; // a future date (a scheduled item), not activity yet
    if (age < weeks * 7) weekly[weeks - 1 - Math.floor(age / 7)] += 1;
    if (age < 30) {
      last30 += 1;
      daily[29 - age] += 1;
      last30ByChurch.set(row.organizationId, (last30ByChurch.get(row.organizationId) ?? 0) + 1);
    } else if (age < 60) {
      prev30 += 1;
    }
    if (age < 7) last7 += 1;
  }
  return { last7, last30, prev30, weekly, daily, last30ByChurch, churchesEver };
}

export interface TrendInfo {
  percent: number | null;
  direction: "up" | "down" | "flat" | "new";
}

/** How the last 30 days compare with the 30 before: up, down, flat (within 5%), or new when there was nothing before. */
export function trendBetween(last30: number, prev30: number): TrendInfo {
  if (prev30 === 0) return last30 === 0 ? { percent: null, direction: "flat" } : { percent: null, direction: "new" };
  const percent = Math.round(((last30 - prev30) / prev30) * 100);
  return { percent, direction: percent >= 5 ? "up" : percent <= -5 ? "down" : "flat" };
}

export type ModuleHealthLabel = "healthy" | "quiet" | "unused" | "attention";

/**
 * A plain label for a module: attention when it logged errors, unused when nobody has data, quiet when churches
 * have data but nothing happened in 30 days, healthy otherwise.
 */
export function healthLabel(input: { churchesEver: number; active30: number; errors7d: number }): ModuleHealthLabel {
  if (input.errors7d > 0) return "attention";
  if (input.churchesEver === 0) return "unused";
  if (input.active30 === 0) return "quiet";
  return "healthy";
}

/** 0-100, for a progress bar: [part] of [whole], never above 100. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export function formatCompact(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
