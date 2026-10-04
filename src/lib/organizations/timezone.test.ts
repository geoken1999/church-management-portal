import { describe, it, expect } from "vitest";
import { zonedTimeToUtc, formatInTimezone, partsInTimezone, dateKeyInTimezone } from "./timezone";

describe("zonedTimeToUtc", () => {
  it("converts a wall-clock time in IST to the correct UTC instant", () => {
    // 7:00 PM IST = 1:30 PM UTC (IST is UTC+5:30, no DST).
    const utc = zonedTimeToUtc("2026-06-15T19:00", "Asia/Kolkata");
    expect(utc.toISOString()).toBe("2026-06-15T13:30:00.000Z");
  });

  it("converts a wall-clock time in a DST-observing zone to the correct UTC instant", () => {
    // 9:00 AM Eastern in June (EDT, UTC-4) = 1:00 PM UTC.
    const summer = zonedTimeToUtc("2026-06-15T09:00", "America/New_York");
    expect(summer.toISOString()).toBe("2026-06-15T13:00:00.000Z");

    // 9:00 AM Eastern in January (EST, UTC-5) = 2:00 PM UTC.
    const winter = zonedTimeToUtc("2026-01-15T09:00", "America/New_York");
    expect(winter.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("round-trips through formatInTimezone back to the original wall-clock time", () => {
    const utc = zonedTimeToUtc("2026-03-10T14:30", "America/Los_Angeles");
    const formatted = formatInTimezone(utc.toISOString(), "America/Los_Angeles", { hour: "2-digit", minute: "2-digit", hour12: false });
    expect(formatted).toContain("14:30");
  });
});

describe("partsInTimezone / dateKeyInTimezone", () => {
  it("matches the IST calendar day even when UTC has already rolled to the next day", () => {
    // 20:30 UTC on June 15 is 02:00 IST on June 16.
    const now = new Date("2026-06-15T20:30:00.000Z");
    expect(partsInTimezone(now, "Asia/Kolkata")).toEqual({ year: 2026, month: 6, day: 16, hour: 2, minute: 0 });
    expect(dateKeyInTimezone(now, "Asia/Kolkata")).toBe("2026-06-16");
  });

  it("differs from IST for a non-IST zone at the same instant", () => {
    const now = new Date("2026-06-15T20:30:00.000Z");
    expect(dateKeyInTimezone(now, "America/Los_Angeles")).toBe("2026-06-15");
  });
});
