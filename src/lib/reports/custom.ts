import type { CustomReport } from "@/types/database";
import { getReportDefinition, type ReportDefinition, type ReportFilters } from "@/lib/reports/registry";

export type DateWindow = CustomReport["date_window"];
export type Frequency = CustomReport["frequency"];

export const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Fixed dates" },
];

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "none", label: "Not scheduled" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const MAX_RECIPIENTS = 10;

// The church's day. Schedules are read in India time, whatever the server's clock says.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The calendar date in India for an instant, as { y, m (1-12), d, weekday (0 = Sunday) }. */
export function istDate(now: Date): { y: number; m: number; d: number; weekday: number; iso: string } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  return { y, m, d, weekday: shifted.getUTCDay(), iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The dates a report looks at on the day it runs; both undefined for "all time". */
export function resolveDateWindow(report: Pick<CustomReport, "date_window" | "date_from" | "date_to">, now: Date): { from?: string; to?: string } {
  const today = istDate(now);
  switch (report.date_window) {
    case "last_7_days":
      return { from: istDate(new Date(now.getTime() - 6 * 86_400_000)).iso, to: today.iso };
    case "last_30_days":
      return { from: istDate(new Date(now.getTime() - 29 * 86_400_000)).iso, to: today.iso };
    case "this_month":
      return { from: iso(today.y, today.m, 1), to: today.iso };
    case "last_month": {
      const y = today.m === 1 ? today.y - 1 : today.y;
      const m = today.m === 1 ? 12 : today.m - 1;
      return { from: iso(y, m, 1), to: iso(y, m, lastDayOf(y, m)) };
    }
    case "this_year":
      return { from: iso(today.y, 1, 1), to: today.iso };
    case "custom":
      return { from: report.date_from ?? undefined, to: report.date_to ?? undefined };
    default:
      return {};
  }
}

/** The filters to run with: the saved ones plus the dates for this run. */
export function reportFilters(report: Pick<CustomReport, "filters" | "date_window" | "date_from" | "date_to">, now: Date): ReportFilters {
  return { ...report.filters, ...resolveDateWindow(report, now) };
}

/** A definition cut down to the columns the report picked, in the order it picked them. */
export function narrowDefinition(report: Pick<CustomReport, "source" | "columns" | "name">): ReportDefinition | null {
  const base = getReportDefinition(report.source);
  if (!base) return null;
  const columns = report.columns.map((key) => base.columns.find((c) => c.key === key)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (columns.length === 0) return null;
  return { ...base, label: report.name, columns };
}

/** Whether a scheduled report should go out on this run. A report that already went out today is never sent twice. */
export function isDue(report: Pick<CustomReport, "frequency" | "schedule_day" | "last_run_at">, now: Date): boolean {
  if (report.frequency === "none") return false;
  const today = istDate(now);
  if (report.last_run_at && istDate(new Date(report.last_run_at)).iso === today.iso) return false;
  if (report.frequency === "daily") return true;
  if (report.frequency === "weekly") return report.schedule_day === today.weekday;
  // Monthly: the chosen day; days past 28 aren't offered, so every month has one.
  return report.schedule_day === today.d;
}

export function scheduleSummary(report: Pick<CustomReport, "frequency" | "schedule_day">): string {
  if (report.frequency === "daily") return "Every day";
  if (report.frequency === "weekly") return `Every ${WEEKDAYS[report.schedule_day ?? 1]}`;
  if (report.frequency === "monthly") return `Monthly on day ${report.schedule_day ?? 1}`;
  return "Not scheduled";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits a typed list of addresses; returns the valid ones (no repeats) and any that aren't addresses. */
export function parseRecipients(text: string): { emails: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    if (!EMAIL.test(part)) invalid.push(part);
    else if (!emails.includes(part)) emails.push(part);
  }
  return { emails, invalid };
}
