import { describe, it, expect } from "vitest";
import {
  resolvePeriodRange,
  daysInRange,
  bucketGranularityForRange,
  buildAccountingBuckets,
} from "./period";

// A fixed Wednesday so "this week"/"this month"/"this year" are
// deterministic regardless of when the suite runs.
const FIXED_NOW = new Date(2026, 2, 18); // Wed, March 18, 2026

describe("resolvePeriodRange", () => {
  it("'today' is a single-day range", () => {
    expect(resolvePeriodRange("today", {}, FIXED_NOW)).toEqual({ start: "2026-03-18", end: "2026-03-18" });
  });

  it("'week' spans Monday through Sunday, containing 'now'", () => {
    const range = resolvePeriodRange("week", {}, FIXED_NOW);
    expect(range).toEqual({ start: "2026-03-16", end: "2026-03-22" });
  });

  it("'month' spans the full calendar month", () => {
    expect(resolvePeriodRange("month", {}, FIXED_NOW)).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });

  it("'year' spans the full calendar year", () => {
    expect(resolvePeriodRange("year", {}, FIXED_NOW)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("'custom' uses the given start/end", () => {
    expect(resolvePeriodRange("custom", { start: "2026-01-05", end: "2026-01-20" }, FIXED_NOW)).toEqual({
      start: "2026-01-05",
      end: "2026-01-20",
    });
  });

  it("'custom' swaps a reversed range rather than producing an empty one", () => {
    expect(resolvePeriodRange("custom", { start: "2026-01-20", end: "2026-01-05" }, FIXED_NOW)).toEqual({
      start: "2026-01-05",
      end: "2026-01-20",
    });
  });

  it("'custom' falls back to a sane default when dates are missing", () => {
    const range = resolvePeriodRange("custom", {}, FIXED_NOW);
    expect(range.start).toBe("2026-03-01");
    expect(range.end).toBe("2026-03-18");
  });
});

describe("daysInRange", () => {
  it("counts inclusively", () => {
    expect(daysInRange({ start: "2026-03-01", end: "2026-03-01" })).toBe(1);
    expect(daysInRange({ start: "2026-03-01", end: "2026-03-31" })).toBe(31);
  });
});

describe("bucketGranularityForRange", () => {
  it("uses daily buckets for a range of a month or less", () => {
    expect(bucketGranularityForRange({ start: "2026-03-01", end: "2026-03-31" })).toBe("day");
  });

  it("uses weekly buckets for a range longer than a month but within ~6 months", () => {
    expect(bucketGranularityForRange({ start: "2026-01-01", end: "2026-04-01" })).toBe("week");
  });

  it("uses monthly buckets for a range longer than ~6 months", () => {
    expect(bucketGranularityForRange({ start: "2026-01-01", end: "2026-12-31" })).toBe("month");
  });
});

describe("buildAccountingBuckets", () => {
  it("produces one bucket per day for daily granularity", () => {
    const buckets = buildAccountingBuckets({ start: "2026-03-01", end: "2026-03-05" }, "day");
    expect(buckets).toHaveLength(5);
    expect(buckets[0].start).toBe("2026-03-01");
    expect(buckets[0].end).toBe("2026-03-01");
    expect(buckets.at(-1)?.start).toBe("2026-03-05");
  });

  it("clamps the last weekly bucket to the range end instead of overshooting", () => {
    const buckets = buildAccountingBuckets({ start: "2026-03-01", end: "2026-03-10" }, "week");
    expect(buckets.at(-1)?.end).toBe("2026-03-10");
  });

  it("produces one bucket per month for monthly granularity, clamped to the range", () => {
    const buckets = buildAccountingBuckets({ start: "2026-01-01", end: "2026-03-15" }, "month");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].start).toBe("2026-01-01");
    expect(buckets.at(-1)?.end).toBe("2026-03-15");
  });

  it("every bucket's dates fall within the overall range", () => {
    const range = { start: "2026-01-01", end: "2026-12-31" };
    const buckets = buildAccountingBuckets(range, "month");
    for (const bucket of buckets) {
      expect(bucket.start >= range.start).toBe(true);
      expect(bucket.end <= range.end).toBe(true);
    }
  });
});
