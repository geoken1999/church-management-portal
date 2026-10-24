import { describe, expect, it } from "vitest";
import { missedInARow, monthlyTotals, rankSignals, trendOf, upcomingCelebrations, type SessionAttendance } from "./insights-math";

const session = (id: string, date: string, roster: string[], attended: string[]): SessionAttendance => ({
  id,
  date,
  rosterIds: new Set(roster),
  attendedIds: new Set(attended),
});

describe("missedInARow", () => {
  const sessions = [
    session("s4", "2026-10-18", ["a", "b", "c"], ["c"]),
    session("s3", "2026-10-11", ["a", "b", "c"], ["b", "c"]),
    session("s2", "2026-10-04", ["a", "b", "c"], ["c"]),
    session("s1", "2026-09-27", ["a", "b", "c"], ["a", "c"]),
  ];
  it("finds people who missed the newest sessions in a row, and when they last came", () => {
    expect(missedInARow(sessions, 2)).toEqual([{ memberId: "a", misses: 3, lastAttended: "2026-09-27" }]);
  });
  it("a single miss, or an attendance in between, does not count", () => {
    expect(missedInARow(sessions, 1).map((m) => m.memberId).sort()).toEqual(["a", "b"]);
    expect(missedInARow(sessions, 4)).toEqual([]);
  });
  it("skips sessions of another branch", () => {
    const mixed = [
      session("s3", "2026-10-18", ["a"], []),
      session("s2", "2026-10-11", ["z"], ["z"]), // a's other-branch session: not expected, not counted
      session("s1", "2026-10-04", ["a"], []),
    ];
    expect(missedInARow(mixed, 2)).toEqual([{ memberId: "a", misses: 2, lastAttended: null }]);
  });
});

describe("trendOf", () => {
  it("needs enough sessions", () => {
    expect(trendOf([10, 12, 9])).toBeNull();
  });
  it("compares the recent half with the earlier half", () => {
    expect(trendOf([80, 90, 100, 110])).toEqual({ recentAverage: 85, previousAverage: 105, changePercent: -19, direction: "down" });
    expect(trendOf([110, 100, 90, 80])?.direction).toBe("up");
    expect(trendOf([100, 101, 100, 99])?.direction).toBe("steady");
    expect(trendOf([5, 5, 0, 0])?.changePercent).toBeNull();
  });
});

describe("monthlyTotals", () => {
  it("sums by month for the months asked for, filling empty ones", () => {
    const now = new Date("2026-10-23T10:00:00Z");
    const rows = [
      { date: "2026-10-05", amount: 100 },
      { date: "2026-10-20", amount: 50.5 },
      { date: "2026-08-15", amount: 200 },
      { date: "2025-01-01", amount: 999 },
    ];
    expect(monthlyTotals(rows, now, 3)).toEqual([
      { month: "2026-08", total: 200 },
      { month: "2026-09", total: 0 },
      { month: "2026-10", total: 150.5 },
    ]);
  });
});

describe("upcomingCelebrations", () => {
  const members = [
    { id: "a", date_of_birth: "1990-10-25", wedding_date: null },
    { id: "b", date_of_birth: "1980-10-23", wedding_date: "2010-11-02" },
    { id: "c", date_of_birth: "1992-12-30", wedding_date: null },
    { id: "d", date_of_birth: "2000-02-29", wedding_date: null },
  ];
  it("lists what falls in the next days, today first", () => {
    const list = upcomingCelebrations(members, "2026-10-23", 14);
    expect(list.map((c) => `${c.memberId}:${c.kind}:${c.daysAway}`)).toEqual(["b:birthday:0", "a:birthday:2", "b:anniversary:10"]);
  });
  it("rolls into next year, and 29 February falls on the 28th in other years", () => {
    expect(upcomingCelebrations(members, "2026-12-28", 5).map((c) => `${c.memberId}:${c.date}`)).toEqual(["c:2026-12-30"]);
    expect(upcomingCelebrations(members, "2026-02-20", 10).find((c) => c.memberId === "d")?.date).toBe("2026-02-28");
  });
});

describe("rankSignals", () => {
  it("puts what needs action first without reordering equals", () => {
    const ranked = rankSignals([
      { area: "1", severity: "ok", finding: "" },
      { area: "2", severity: "act", finding: "" },
      { area: "3", severity: "watch", finding: "" },
      { area: "4", severity: "act", finding: "" },
    ]);
    expect(ranked.map((s) => s.area)).toEqual(["2", "4", "3", "1"]);
  });
});
