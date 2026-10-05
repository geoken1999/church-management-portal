import { describe, it, expect } from "vitest";
import { evaluateFollowup, isWithinConsecutiveRange } from "./followup-eligibility";

// Most recent first.
const SUNDAYS = ["2026-10-04", "2026-09-27", "2026-09-20", "2026-09-13", "2026-09-06"];

function input(overrides: Partial<Parameters<typeof evaluateFollowup>[0]> = {}) {
  return {
    sundays: SUNDAYS,
    recordedSundays: new Set(SUNDAYS),
    presentByDate: new Map<string, Set<string>>(),
    memberIds: ["ann", "ben"],
    requiredConsecutive: 3,
    ...overrides,
  };
}

describe("evaluateFollowup", () => {
  it("does not flag a member present on every eligible Sunday", () => {
    const present = new Map(SUNDAYS.map((d) => [d, new Set(["ann", "ben"])]));
    const result = evaluateFollowup(input({ presentByDate: present }));
    expect(result.qualifiedMemberIds).toEqual([]);
  });

  it("does not flag a member absent for fewer than the threshold", () => {
    const present = new Map([
      ["2026-10-04", new Set(["ben"])],
      ["2026-09-27", new Set(["ben"])],
      ["2026-09-20", new Set(["ann"])],
    ]);
    const result = evaluateFollowup(input({ presentByDate: present }));
    expect(result.qualifiedMemberIds).toEqual([]);
  });

  it("flags a member absent for exactly the configured consecutive recorded Sundays", () => {
    const present = new Map([
      ["2026-10-04", new Set(["ben"])],
      ["2026-09-27", new Set(["ben"])],
      ["2026-09-20", new Set(["ben"])],
    ]);
    const result = evaluateFollowup(input({ presentByDate: present }));
    expect(result.qualifiedMemberIds).toEqual(["ann"]);
  });

  it("skips unrecorded Sundays instead of counting them as absence", () => {
    // 2026-09-27 was never recorded: nobody can be flagged from it.
    const recorded = new Set(["2026-10-04", "2026-09-20", "2026-09-13", "2026-09-06"]);
    const result = evaluateFollowup(input({ recordedSundays: recorded, presentByDate: new Map() }));
    expect(result.skippedUnrecordedSundays).toEqual(["2026-09-27"]);
    // Ann and Ben are absent on every recorded Sunday, so both qualify.
    expect(result.qualifiedMemberIds.sort()).toEqual(["ann", "ben"]);
  });

  it("does not flag anyone when there are too few recorded Sundays", () => {
    const recorded = new Set(["2026-10-04", "2026-09-27"]);
    const result = evaluateFollowup(input({ recordedSundays: recorded }));
    expect(result.insufficientData).toBe(true);
    expect(result.qualifiedMemberIds).toEqual([]);
  });

  it("only returns members that were in scope", () => {
    // A member outside branch scope is never passed in, so never flagged.
    const result = evaluateFollowup(input({ memberIds: ["ann"] }));
    expect(result.qualifiedMemberIds).toEqual(["ann"]);
  });

  it("treats a session with no record as missing data, not as a present member", () => {
    const recorded = new Set(SUNDAYS);
    const present = new Map([["2026-10-04", new Set(["ann"])]]);
    const result = evaluateFollowup(input({ recordedSundays: recorded, presentByDate: present }));
    expect(result.qualifiedMemberIds).toEqual(["ben"]);
  });
});

describe("isWithinConsecutiveRange", () => {
  it("accepts 2 to 12 and rejects anything else", () => {
    expect(isWithinConsecutiveRange(2)).toBe(true);
    expect(isWithinConsecutiveRange(12)).toBe(true);
    expect(isWithinConsecutiveRange(1)).toBe(false);
    expect(isWithinConsecutiveRange(13)).toBe(false);
    expect(isWithinConsecutiveRange(3.5)).toBe(false);
  });
});
