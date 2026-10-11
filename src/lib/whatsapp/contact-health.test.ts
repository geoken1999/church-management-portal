import { describe, it, expect } from "vitest";
import { blockDaysFor, friendlyDeliveryReason, isBlocked, isMarketingCategory } from "./contact-health";

describe("blockDaysFor", () => {
  it("holds marketing back 3, then 7, then 14 days for repeated 131049", () => {
    expect(blockDaysFor("131049", 1)).toBe(3);
    expect(blockDaysFor("131049", 2)).toBe(7);
    expect(blockDaysFor("131049", 3)).toBe(14);
    expect(blockDaysFor("131049", 9)).toBe(14);
  });

  it("holds an unreachable number back for 30 days and ignores other errors", () => {
    expect(blockDaysFor("131026", 1)).toBe(30);
    expect(blockDaysFor("131047", 1)).toBeNull();
    expect(blockDaysFor(null, 1)).toBeNull();
  });
});

describe("isBlocked", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  it("is blocked only until the date passes", () => {
    expect(isBlocked("2026-10-12T00:00:00Z", now)).toBe(true);
    expect(isBlocked("2026-10-10T00:00:00Z", now)).toBe(false);
    expect(isBlocked(null, now)).toBe(false);
  });
});

describe("isMarketingCategory / friendlyDeliveryReason", () => {
  it("only marketing is capped", () => {
    expect(isMarketingCategory("marketing")).toBe(true);
    expect(isMarketingCategory("MARKETING")).toBe(true);
    expect(isMarketingCategory("utility")).toBe(false);
    expect(isMarketingCategory(null)).toBe(false);
  });

  it("explains known codes in plain English", () => {
    expect(friendlyDeliveryReason("131049")).toContain("limiting marketing");
    expect(friendlyDeliveryReason("131026")).toContain("can't receive");
    expect(friendlyDeliveryReason("999")).toContain("couldn't deliver");
  });
});
