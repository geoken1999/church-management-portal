// Pure timezone math, deliberately free of "server-only" — needed both
// client-side (EventsManager's datetime-local inputs, display labels) and
// server-side (createEvent/updateEvent, pass/reminder emails, crons).

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

// Curated, not Intl.supportedValuesOf("timeZone")'s full ~418-zone list —
// this UI kit has no searchable combobox, and a plain <Select> over 418
// entries is unusable. Covers India (this app's primary base) plus the
// major hubs a global/diaspora admin is likely to be in.
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur" },
  { value: "Asia/Dhaka", label: "Dhaka" },
  { value: "Asia/Colombo", label: "Colombo" },
  { value: "Asia/Kathmandu", label: "Kathmandu" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris / Berlin / Rome (CET)" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Africa/Nairobi", label: "Nairobi" },
  { value: "Africa/Lagos", label: "Lagos" },
  { value: "America/New_York", label: "New York (Eastern)" },
  { value: "America/Chicago", label: "Chicago (Central)" },
  { value: "America/Denver", label: "Denver (Mountain)" },
  { value: "America/Los_Angeles", label: "Los Angeles (Pacific)" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Sao_Paulo", label: "Sao Paulo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Pacific/Auckland", label: "Auckland" },
  { value: "UTC", label: "UTC" },
];

const COMMON_TIMEZONE_VALUES = new Set(COMMON_TIMEZONES.map((tz) => tz.value));

export function isKnownTimezone(value: string): boolean {
  return COMMON_TIMEZONE_VALUES.has(value);
}

// Converts a wall-clock "YYYY-MM-DDTHH:mm" string (exactly what a
// datetime-local input produces, with no timezone of its own) into the
// correct UTC instant for an arbitrary IANA zone — the standard two-pass
// trick: guess the instant assuming UTC, see what wall-clock time that
// guess actually renders as in the target zone, then correct by the
// difference. A second pass handles the rare case where the first
// correction crosses a DST transition.
export function zonedTimeToUtc(dateTimeLocal: string, timeZone: string): Date {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute);

  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    // hour12: false can render midnight as "24" in some ICU builds.
    const renderedHour = get("hour") % 24;
    const renderedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), renderedHour, get("minute"));
    const diff = Date.UTC(year, month - 1, day, hour, minute) - renderedAsUtc;
    guess += diff;
  }

  return new Date(guess);
}

// Thin wrapper for every display site — formats an instant in the given
// IANA zone instead of the viewer's browser/server-runtime default.
// `locale` defaults to undefined (the viewer's own browser locale, fine
// for a dashboard page that's never server-rendered past the first
// paint); pass a fixed locale explicitly for anything server-rendered
// then hydrated, where an environment-dependent locale would otherwise
// risk a hydration mismatch on top of the timezone one this function
// already fixes.
export function formatInTimezone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions, locale?: string): string {
  return new Date(iso).toLocaleString(locale, { ...options, timeZone });
}

// Generalizes the hand-rolled istParts/todayInIST/istDateKey helpers that
// used to hardcode Asia/Kolkata — same Intl.DateTimeFormat.formatToParts
// approach, just parameterized on timeZone.
export function partsInTimezone(
  now: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

export function dateKeyInTimezone(now: Date, timeZone: string): string {
  const { year, month, day } = partsInTimezone(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
