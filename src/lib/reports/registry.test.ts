import { describe, it, expect } from "vitest";
import { REPORT_DEFINITIONS, getReportDefinition } from "./registry";
import { TAB_KEYS } from "@/lib/permissions/tabs";

describe("getReportDefinition", () => {
  it("returns the matching definition for a known report id", () => {
    const definition = getReportDefinition("members");
    expect(definition?.id).toBe("members");
    expect(definition?.tab).toBe("members");
  });

  it("returns undefined for an unknown report id", () => {
    expect(getReportDefinition("not-a-real-report")).toBeUndefined();
  });
});

describe("REPORT_DEFINITIONS", () => {
  it("includes all five reports built this session", () => {
    const ids = REPORT_DEFINITIONS.map((d) => d.id).sort();
    expect(ids).toEqual(["attendance", "donations", "events", "members", "offerings"].sort());
  });

  it("has no duplicate report ids", () => {
    const ids = REPORT_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every report's gating tab is a real, known TabKey", () => {
    for (const definition of REPORT_DEFINITIONS) {
      expect(TAB_KEYS).toContain(definition.tab);
    }
  });

  it("every report has at least one column to render", () => {
    for (const definition of REPORT_DEFINITIONS) {
      expect(definition.columns.length).toBeGreaterThan(0);
    }
  });

  it("every column has a unique key within its report (no ambiguous cells)", () => {
    for (const definition of REPORT_DEFINITIONS) {
      const keys = definition.columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("every dateRange/branch/select filter has a non-empty label", () => {
    for (const definition of REPORT_DEFINITIONS) {
      for (const filter of definition.filters) {
        expect(filter.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("every 'select' filter declares at least one option", () => {
    for (const definition of REPORT_DEFINITIONS) {
      for (const filter of definition.filters) {
        if (filter.type === "select") {
          expect(filter.options?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("donations report filters by method, not branch (donations have no branch_id)", () => {
    const donations = getReportDefinition("donations");
    expect(donations?.filters.some((f) => f.type === "branch")).toBe(false);
    expect(donations?.filters.some((f) => f.key === "method")).toBe(true);
  });
});
