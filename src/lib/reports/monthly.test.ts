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

import { BUILT_IN_TEMPLATES, dateLabelIn, isPeriodOfKind, isFinishedPeriod, periodLabelIn, rangeOf, reportLabels, SECTION_KEYS } from "./monthly";

describe("annual reports", () => {
  it("takes a year or a month depending on the kind", () => {
    expect(isPeriodOfKind("annual", "2025")).toBe(true);
    expect(isPeriodOfKind("annual", "2025-03")).toBe(false);
    expect(isPeriodOfKind("monthly", "2025-03")).toBe(true);
    expect(isPeriodOfKind("monthly", "2025")).toBe(false);
  });

  it("covers a whole year", () => {
    expect(rangeOf("2025")).toEqual({ from: "2025-01-01", toExclusive: "2026-01-01" });
    expect(rangeOf("2025-12")).toEqual({ from: "2025-12-01", toExclusive: "2026-01-01" });
  });

  it("only allows a year once it is over", () => {
    expect(isFinishedPeriod("2025", new Date(2026, 0, 1))).toBe(true);
    expect(isFinishedPeriod("2026", new Date(2026, 10, 1))).toBe(false);
  });
});

describe("languages", () => {
  it("has every heading in English, Tamil and Hindi", () => {
    const keys = Object.keys(reportLabels("en")).sort();
    expect(Object.keys(reportLabels("ta")).sort()).toEqual(keys);
    expect(Object.keys(reportLabels("hi")).sort()).toEqual(keys);
    for (const language of ["en", "ta", "hi"] as const) {
      for (const [key, value] of Object.entries(reportLabels(language))) expect(value.trim().length, `${language}.${key}`).toBeGreaterThan(0);
    }
  });

  it("writes the month name in the language", () => {
    expect(periodLabelIn("2026-09", "en")).toBe("September 2026");
    expect(periodLabelIn("2026-09", "ta")).not.toBe("September 2026");
    expect(periodLabelIn("2026-09", "hi")).not.toBe("September 2026");
    expect(periodLabelIn("2025", "ta")).toBe("2025");
  });

  it("writes a day in the language", () => {
    expect(dateLabelIn("2026-09-14", "en")).toContain("14");
  });
});

describe("templates", () => {
  it("only uses real sections", () => {
    for (const template of BUILT_IN_TEMPLATES) {
      for (const section of template.config.sections) expect(SECTION_KEYS).toContain(section);
    }
  });
});
