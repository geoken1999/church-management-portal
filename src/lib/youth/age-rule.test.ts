import { describe, it, expect } from "vitest";
import { ageOn, isInYouthAgeRange, parseYouthAgeRule } from "./age-rule";

describe("parseYouthAgeRule", () => {
  it("reads a valid range", () => {
    expect(parseYouthAgeRule("13", "25").rule).toEqual({ from: 13, to: 25 });
    expect(parseYouthAgeRule(13, 13).rule).toEqual({ from: 13, to: 13 });
  });

  it("treats both blank as turning the rule off, and one blank as an error", () => {
    expect(parseYouthAgeRule("", "").rule).toBeNull();
    expect(parseYouthAgeRule("13", "").error).toBeDefined();
    expect(parseYouthAgeRule("", "25").error).toBeDefined();
  });

  it("rejects reversed, fractional and out-of-range ages", () => {
    expect(parseYouthAgeRule("25", "13").error).toBeDefined();
    expect(parseYouthAgeRule("13.5", "20").error).toBeDefined();
    expect(parseYouthAgeRule("-1", "20").error).toBeDefined();
    expect(parseYouthAgeRule("10", "150").error).toBeDefined();
  });
});

describe("ageOn / isInYouthAgeRange", () => {
  const today = new Date("2026-10-11T00:00:00Z");

  it("counts whole years, turning a year older on the birthday", () => {
    expect(ageOn("2008-10-11", today)).toBe(18);
    expect(ageOn("2008-10-12", today)).toBe(17);
  });

  it("includes both ends of the range", () => {
    const rule = { from: 13, to: 18 };
    expect(isInYouthAgeRange("2008-10-11", rule, today)).toBe(true); // 18
    expect(isInYouthAgeRange("2013-10-11", rule, today)).toBe(true); // 13
    expect(isInYouthAgeRange("2007-10-11", rule, today)).toBe(false); // 19
    expect(isInYouthAgeRange("2013-10-12", rule, today)).toBe(false); // 12
  });

  it("nobody qualifies without a birth date or a rule", () => {
    expect(isInYouthAgeRange(null, { from: 13, to: 18 }, today)).toBe(false);
    expect(isInYouthAgeRange("2010-01-01", null, today)).toBe(false);
  });
});
