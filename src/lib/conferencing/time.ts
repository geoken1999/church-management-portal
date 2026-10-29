// Turning what a person types for the church's time zone into an exact moment. Pure.

/** A "2026-11-02T18:30" typed for the church's time zone, as an exact moment (ISO, UTC). */
export function zonedToIso(local: string, timeZone: string): string {
  const asUtc = new Date(`${local}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return local;
  try {
    // How far the zone is from UTC at that moment, found by formatting the same instant in the zone.
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(asUtc);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return new Date(asUtc.getTime() - (shown - asUtc.getTime())).toISOString();
  } catch {
    return asUtc.toISOString();
  }
}
