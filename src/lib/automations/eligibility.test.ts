import { describe, it, expect } from "vitest";
import { resolveTargetMonthDay, matchesMonthDay, todayInTimezone, dateKeyInOrgTimezone } from "./date-logic";

describe("resolveTargetMonthDay", () => {
  it("matches month/day ignoring year, with no offset", () => {
    const today = { year: 2026, month: 3, day: 14 };
    expect(resolveTargetMonthDay(today, 0)).toEqual({ month: 3, day: 14, occurrenceYear: 2026, matchFeb29Day: false });
  });

  it("shifts the comparison target forward by daysOffset, not backward", () => {
    const today = { year: 2026, month: 3, day: 14 };
    expect(resolveTargetMonthDay(today, 3)).toEqual({ month: 3, day: 17, occurrenceYear: 2026, matchFeb29Day: false });
  });

  it("rolls into the next month/year correctly near a month boundary", () => {
    const today = { year: 2026, month: 1, day: 30 };
    expect(resolveTargetMonthDay(today, 3)).toEqual({ month: 2, day: 2, occurrenceYear: 2026, matchFeb29Day: false });
  });

  it("flags matchFeb29Day when the target lands on Feb 28 of a non-leap year", () => {
    const today = { year: 2027, month: 2, day: 25 };
    expect(resolveTargetMonthDay(today, 3)).toEqual({ month: 2, day: 28, occurrenceYear: 2027, matchFeb29Day: true });
  });

  it("does not flag matchFeb29Day when Feb 28 falls in a leap year (Feb 29 exists for real that year)", () => {
    const today = { year: 2028, month: 2, day: 25 };
    expect(resolveTargetMonthDay(today, 3)).toEqual({ month: 2, day: 28, occurrenceYear: 2028, matchFeb29Day: false });
  });
});

describe("matchesMonthDay", () => {
  it("matches a plain month/day", () => {
    expect(matchesMonthDay("1990-03-14", 3, 14)).toBe(true);
    expect(matchesMonthDay("1990-03-15", 3, 14)).toBe(false);
  });

  it("returns false for a null date", () => {
    expect(matchesMonthDay(null, 3, 14)).toBe(false);
  });

  it("matches a Feb 29 birthday against a Feb 28 target only when matchFeb29Day is set", () => {
    expect(matchesMonthDay("1992-02-29", 2, 28, true)).toBe(true);
    expect(matchesMonthDay("1992-02-29", 2, 28, false)).toBe(false);
  });
});

describe("todayInTimezone / dateKeyInOrgTimezone", () => {
  it("defaults to Asia/Kolkata when no timezone is given", () => {
    // 2026-03-14T20:00:00Z is 2026-03-15 01:30 IST (UTC+5:30).
    const now = new Date("2026-03-14T20:00:00Z");
    expect(todayInTimezone(now)).toEqual({ year: 2026, month: 3, day: 15 });
    expect(dateKeyInOrgTimezone(now)).toBe("2026-03-15");
  });

  it("uses the given org timezone instead of the default", () => {
    // 2026-03-14T20:00:00Z is still 2026-03-14 in America/Los_Angeles (UTC-7/8).
    const now = new Date("2026-03-14T20:00:00Z");
    expect(todayInTimezone(now, "America/Los_Angeles")).toEqual({ year: 2026, month: 3, day: 14 });
    expect(dateKeyInOrgTimezone(now, "America/Los_Angeles")).toBe("2026-03-14");
  });
});
