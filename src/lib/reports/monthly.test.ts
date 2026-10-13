import { describe, expect, it } from "vitest";
import { isFinishedMonth, isPeriod, isSectionKey, money, periodDateRange, periodLabel } from "./monthly";

describe("monthly report periods", () => {
  it("accepts only YYYY-MM", () => {
    expect(isPeriod("2026-09")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-9")).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
  });

  it("works out a month's range, across a year end", () => {
    expect(periodDateRange("2026-09")).toEqual({ from: "2026-09-01", toExclusive: "2026-10-01" });
    expect(periodDateRange("2026-12")).toEqual({ from: "2026-12-01", toExclusive: "2027-01-01" });
  });

  it("names the month", () => {
    expect(periodLabel("2026-09")).toBe("September 2026");
  });

  it("only allows a report once the month is over", () => {
    expect(isFinishedMonth("2026-09", new Date(2026, 9, 1))).toBe(true);
    expect(isFinishedMonth("2026-09", new Date(2026, 8, 30))).toBe(false);
    expect(isFinishedMonth("2026-10", new Date(2026, 9, 13))).toBe(false);
  });

  it("knows the sections", () => {
    expect(isSectionKey("giving")).toBe(true);
    expect(isSectionKey("secrets")).toBe(false);
  });

  it("rounds money", () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
  });
});
