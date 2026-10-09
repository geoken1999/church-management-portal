import { describe, it, expect } from "vitest";
import { buildDirectIdempotencyKey, buildDigestIdempotencyKey, buildCelebrantList } from "./date-logic";

describe("buildDirectIdempotencyKey", () => {
  it("is stable for the same trigger/member/year", () => {
    const key1 = buildDirectIdempotencyKey("trigger-1", "member-1", 2026);
    const key2 = buildDirectIdempotencyKey("trigger-1", "member-1", 2026);
    expect(key1).toBe(key2);
  });

  it("differs by occurrence year, so next year's occurrence isn't blocked by this year's", () => {
    const thisYear = buildDirectIdempotencyKey("trigger-1", "member-1", 2026);
    const nextYear = buildDirectIdempotencyKey("trigger-1", "member-1", 2027);
    expect(thisYear).not.toBe(nextYear);
  });
});

describe("buildDigestIdempotencyKey", () => {
  it("is the same for two runs on the same IST calendar day", () => {
    // Both fall on 2026-03-15 in Asia/Kolkata (UTC+5:30).
    const morning = buildDigestIdempotencyKey("automation-1", new Date("2026-03-15T01:00:00Z"));
    const evening = buildDigestIdempotencyKey("automation-1", new Date("2026-03-15T10:00:00Z"));
    expect(morning).toBe(evening);
  });

  it("differs across calendar days", () => {
    const day1 = buildDigestIdempotencyKey("automation-1", new Date("2026-03-15T20:00:00Z"));
    const day2 = buildDigestIdempotencyKey("automation-1", new Date("2026-03-16T20:00:00Z"));
    expect(day1).not.toBe(day2);
  });
});

describe("buildCelebrantList", () => {
  it("joins name — occasion entries inline (no newlines, which Meta rejects)", () => {
    const list = buildCelebrantList([
      { name: "Priya Nair", occasionLabel: "Birthday" },
      { name: "Thomas & Anjali", occasionLabel: "Wedding Anniversary" },
    ]);
    expect(list).toBe("Priya Nair — Birthday; Thomas & Anjali — Wedding Anniversary");
  });

  it("truncates and notes the remainder past 30 celebrants", () => {
    const celebrants = Array.from({ length: 35 }, (_, i) => ({ name: `Member ${i}`, occasionLabel: "Birthday" }));
    const list = buildCelebrantList(celebrants);
    expect(list.split("; ")).toHaveLength(31);
    expect(list).toContain("...and 5 more");
  });
});
