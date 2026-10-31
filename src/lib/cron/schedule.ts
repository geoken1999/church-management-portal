// Pure helpers for reading vercel.json cron expressions, free of
// "server-only" so they're unit-testable. Only the "M H * * *" daily shape
// and the "*/N * * * *" every-N-minutes shape this project uses are
// understood; anything else returns null rather than guessing.

// "every 15 minutes" -> 15. Only intervals that divide the hour evenly.
export function parseIntervalMinutes(expression: string): number | null {
  const match = expression.trim().match(/^\*\/(\d{1,2}) \* \* \* \*$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  return minutes >= 1 && 60 % minutes === 0 ? minutes : null;
}

export function parseDailySchedule(expression: string): { minute: number; hour: number } | null {
  const match = expression.trim().match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  return { minute, hour };
}

// The most recent time (UTC, as Vercel evaluates it) the schedule should
// have fired at or before `now`.
export function lastExpectedRun(expression: string, now: Date): Date | null {
  const every = parseIntervalMinutes(expression);
  if (every) {
    // Vercel can fire a little late, so the slot before the latest one is the one that must certainly have run.
    const slot = every * 60_000;
    return new Date(Math.floor(now.getTime() / slot) * slot - slot);
  }
  const daily = parseDailySchedule(expression);
  if (!daily) return null;
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), daily.hour, daily.minute));
  if (candidate.getTime() > now.getTime()) candidate.setUTCDate(candidate.getUTCDate() - 1);
  return candidate;
}

export function describeSchedule(expression: string): string {
  const every = parseIntervalMinutes(expression);
  if (every) return `Every ${every} minutes`;
  const daily = parseDailySchedule(expression);
  if (!daily) return expression;
  const utcMinutes = daily.hour * 60 + daily.minute;
  const istMinutes = (utcMinutes + 330) % 1440;
  const fmt = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return `Daily at ${fmt(istMinutes)} IST (${fmt(utcMinutes)} UTC)`;
}
