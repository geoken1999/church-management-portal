import { describe, expect, it } from "vitest";
import { isGivingType, normalizeGivingTypes, recordKindFor } from "@/lib/finance/giving-types";

describe("giving types", () => {
  it("recognises the three kinds", () => {
    expect(isGivingType("tithe")).toBe(true);
    expect(isGivingType("fundraiser")).toBe(false);
    expect(isGivingType(5)).toBe(false);
  });
  it("keeps known types once, in order", () => {
    expect(normalizeGivingTypes(["donation", "tithe", "tithe", "x"])).toEqual(["tithe", "donation"]);
    expect(normalizeGivingTypes("tithe")).toEqual([]);
  });
  it("records offerings and tithes as offerings, the rest as donations", () => {
    expect(recordKindFor("tithe")).toEqual({ table: "offerings", category: "Tithe" });
    expect(recordKindFor("offering")).toEqual({ table: "offerings", category: "Offering" });
    expect(recordKindFor("donation")).toEqual({ table: "donations" });
    expect(recordKindFor("fundraiser")).toEqual({ table: "donations" });
  });
});
