import { describe, expect, it } from "vitest";
import { isDue, narrowDefinition, parseRecipients, reportFilters, resolveDateWindow, scheduleSummary } from "@/lib/reports/custom";

// 2026-03-15 10:00 India time
const now = new Date("2026-03-15T04:30:00Z");
const base = { date_window: "all" as const, date_from: null, date_to: null };

describe("resolveDateWindow", () => {
  it("is open for all time", () => expect(resolveDateWindow(base, now)).toEqual({}));
  it("covers the last 7 days including today", () => expect(resolveDateWindow({ ...base, date_window: "last_7_days" }, now)).toEqual({ from: "2026-03-09", to: "2026-03-15" }));
  it("covers last month whole, across a year end", () => {
    expect(resolveDateWindow({ ...base, date_window: "last_month" }, now)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolveDateWindow({ ...base, date_window: "last_month" }, new Date("2026-01-10T00:00:00Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("uses India's date just after midnight there", () => {
    expect(resolveDateWindow({ ...base, date_window: "this_month" }, new Date("2026-03-31T19:00:00Z"))).toEqual({ from: "2026-04-01", to: "2026-04-01" });
  });
  it("keeps fixed dates", () => expect(resolveDateWindow({ date_window: "custom", date_from: "2026-01-01", date_to: "2026-01-31" }, now)).toEqual({ from: "2026-01-01", to: "2026-01-31" }));
});

describe("reportFilters", () => {
  it("adds the dates to the saved filters", () => expect(reportFilters({ ...base, date_window: "this_year", filters: { branchId: "b1" } }, now)).toEqual({ branchId: "b1", from: "2026-01-01", to: "2026-03-15" }));
});

describe("narrowDefinition", () => {
  it("keeps the picked columns in the picked order, under the report's name", () => {
    const def = narrowDefinition({ source: "members", name: "Phones", columns: ["phone", "firstName", "nope"] });
    expect(def?.label).toBe("Phones");
    expect(def?.columns.map((c) => c.key)).toEqual(["phone", "firstName"]);
  });
  it("is null for an unknown source or no valid columns", () => {
    expect(narrowDefinition({ source: "nope", name: "x", columns: ["a"] })).toBeNull();
    expect(narrowDefinition({ source: "members", name: "x", columns: ["zzz"] })).toBeNull();
  });
});

describe("isDue", () => {
  it("never for an unscheduled report", () => expect(isDue({ frequency: "none", schedule_day: null, last_run_at: null }, now)).toBe(false));
  it("daily, once a day", () => {
    expect(isDue({ frequency: "daily", schedule_day: null, last_run_at: null }, now)).toBe(true);
    expect(isDue({ frequency: "daily", schedule_day: null, last_run_at: "2026-03-15T01:00:00Z" }, now)).toBe(false);
    expect(isDue({ frequency: "daily", schedule_day: null, last_run_at: "2026-03-14T01:00:00Z" }, now)).toBe(true);
  });
  it("weekly on the chosen weekday (15 March 2026 is a Sunday)", () => {
    expect(isDue({ frequency: "weekly", schedule_day: 0, last_run_at: null }, now)).toBe(true);
    expect(isDue({ frequency: "weekly", schedule_day: 1, last_run_at: null }, now)).toBe(false);
  });
  it("monthly on the chosen day", () => {
    expect(isDue({ frequency: "monthly", schedule_day: 15, last_run_at: null }, now)).toBe(true);
    expect(isDue({ frequency: "monthly", schedule_day: 1, last_run_at: null }, now)).toBe(false);
  });
});

describe("parseRecipients", () => {
  it("splits, lowercases, dedupes and flags bad ones", () => {
    expect(parseRecipients("A@x.com, b@y.org;a@x.com nope")).toEqual({ emails: ["a@x.com", "b@y.org"], invalid: ["nope"] });
  });
});

describe("scheduleSummary", () => {
  it("reads naturally", () => {
    expect(scheduleSummary({ frequency: "weekly", schedule_day: 1 })).toBe("Every Monday");
    expect(scheduleSummary({ frequency: "monthly", schedule_day: 5 })).toBe("Monthly on day 5");
  });
});
