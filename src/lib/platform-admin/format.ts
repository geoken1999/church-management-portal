import { DEFAULT_TIMEZONE, formatInTimezone } from "@/lib/organizations/timezone";

// Platform admin shows every time in Indian time, the platform's own zone,
// not the viewer's browser zone. Otherwise two admins in different places
// see different times for the same log line.

type TimeInput = string | number | Date;

export function formatPlatformDateTime(value: TimeInput): string {
  const iso = new Date(value).toISOString();
  return `${formatInTimezone(iso, DEFAULT_TIMEZONE, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }, "en-IN")} IST`;
}

export function formatPlatformDate(value: TimeInput): string {
  const iso = new Date(value).toISOString();
  return formatInTimezone(iso, DEFAULT_TIMEZONE, { day: "numeric", month: "short", year: "numeric" }, "en-IN");
}
