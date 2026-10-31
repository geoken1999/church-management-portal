import { partsInTimezone, zonedTimeToUtc } from "@/lib/organizations/timezone";

export type Repeat = "none" | "daily" | "weekly" | "monthly";
export const REPEATS: Repeat[] = ["none", "daily", "weekly", "monthly"];
export const REPEAT_LABELS: Record<Repeat, string> = { none: "Does not repeat", daily: "Every day", weekly: "Every week", monthly: "Every month" };

export function isRepeat(value: unknown): value is Repeat {
  return typeof value === "string" && (REPEATS as string[]).includes(value);
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// The next time a repeating message goes out after `now`, at the same wall-clock time in the church's time zone
// (so 9:00 stays 9:00 across daylight-saving changes). Times that were missed while nothing ran are skipped, not
// sent in a burst. A monthly message keeps its day of the month, using the month's last day when it is shorter.
export function nextOccurrence(from: Date, repeat: Exclude<Repeat, "none">, timeZone: string, now: Date, anchorDay?: number): Date {
  const start = partsInTimezone(from, timeZone);
  const anchor = anchorDay ?? start.day;
  let year = start.year;
  let month = start.month;
  let day = start.day;
  for (let i = 0; i < 2000; i++) {
    if (repeat === "monthly") {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      day = Math.min(anchor, daysIn(year, month));
    } else {
      const d = new Date(Date.UTC(year, month - 1, day + (repeat === "daily" ? 1 : 7)));
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1;
      day = d.getUTCDate();
    }
    const at = zonedTimeToUtc(`${year}-${pad(month)}-${pad(day)}T${pad(start.hour)}:${pad(start.minute)}`, timeZone);
    if (at.getTime() > now.getTime()) return at;
  }
  return new Date(now.getTime() + 86_400_000);
}
