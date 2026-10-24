import { describe, expect, it } from "vitest";
import { formatCompact, healthLabel, percentOf, summarizeActivity, trendBetween } from "./math";

const now = new Date("2026-10-25T10:00:00Z");

describe("summarizeActivity", () => {
  const rows = [
    { organizationId: "a", date: "2026-10-25T01:00:00Z" }, // today
    { organizationId: "a", date: "2026-10-20" }, // 5 days ago
    { organizationId: "b", date: "2026-10-01" }, // 24 days ago
    { organizationId: "b", date: "2026-09-10" }, // 45 days ago: the 30 before
    { organizationId: "c", date: "2025-01-01" }, // long ago: counts as ever
    { organizationId: "d", date: "2026-11-02" }, // in the future: not activity
    { organizationId: "d", date: "not a date" },
  ];
  const s = summarizeActivity(rows, now, 12);
  it("counts the windows", () => {
    expect(s.last7).toBe(2);
    expect(s.last30).toBe(3);
    expect(s.prev30).toBe(1);
  });
  it("buckets by week and day, newest last", () => {
    expect(s.weekly).toHaveLength(12);
    expect(s.weekly[11]).toBe(2); // the newest 7 days
    expect(s.weekly[8]).toBe(1); // 24 days ago is in the 4th week back
    expect(s.daily).toHaveLength(30);
    expect(s.daily[29]).toBe(1);
    expect(s.daily[24]).toBe(1);
  });
  it("knows which churches are active now and which ever were", () => {
    expect(Object.fromEntries(s.last30ByChurch)).toEqual({ a: 2, b: 1 });
    expect([...s.churchesEver].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("trendBetween", () => {
  it("compares the last 30 days with the 30 before", () => {
    expect(trendBetween(150, 100)).toEqual({ percent: 50, direction: "up" });
    expect(trendBetween(50, 100)).toEqual({ percent: -50, direction: "down" });
    expect(trendBetween(102, 100).direction).toBe("flat");
    expect(trendBetween(5, 0)).toEqual({ percent: null, direction: "new" });
    expect(trendBetween(0, 0)).toEqual({ percent: null, direction: "flat" });
  });
});

describe("healthLabel", () => {
  it("names the state of a module", () => {
    expect(healthLabel({ churchesEver: 3, active30: 2, errors7d: 0 })).toBe("healthy");
    expect(healthLabel({ churchesEver: 3, active30: 0, errors7d: 0 })).toBe("quiet");
    expect(healthLabel({ churchesEver: 0, active30: 0, errors7d: 0 })).toBe("unused");
    expect(healthLabel({ churchesEver: 3, active30: 2, errors7d: 4 })).toBe("attention");
  });
});

describe("small helpers", () => {
  it("percentOf and formatCompact", () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(5, 4)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(12_300)).toBe("12.3k");
    expect(formatCompact(250_000)).toBe("2.5L");
  });
});
