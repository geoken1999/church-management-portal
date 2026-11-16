import { describe, it, expect } from "vitest";
import {
  buildDirectIdempotencyKey,
  buildDigestIdempotencyKey,
  buildCelebrantList,
  buildWeeklyCelebrantList,
  buildWeeklyIdempotencyKey,
  isSundayInTimezone,
  weekDayLabel,
  WEEKLY_LIST_MAX_CHARS,
} from "./date-logic";

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

describe("isSundayInTimezone", () => {
  it("is true on a Sunday in the church's own timezone, and false on other days", () => {
    // 2026-11-15 is a Sunday. 01:00 UTC is 06:30 in India: still Sunday there.
    expect(isSundayInTimezone(new Date("2026-11-15T01:00:00Z"), "Asia/Kolkata")).toBe(true);
    expect(isSundayInTimezone(new Date("2026-11-16T01:00:00Z"), "Asia/Kolkata")).toBe(false); // Monday
    expect(isSundayInTimezone(new Date("2026-11-14T01:00:00Z"), "Asia/Kolkata")).toBe(false); // Saturday
  });
  it("goes by the church's timezone, not UTC", () => {
    // 20:00 UTC on Saturday the 14th is already Sunday 01:30 in India, but still Saturday afternoon in New York.
    expect(isSundayInTimezone(new Date("2026-11-14T20:00:00Z"), "Asia/Kolkata")).toBe(true);
    expect(isSundayInTimezone(new Date("2026-11-14T20:00:00Z"), "America/New_York")).toBe(false);
  });
});

describe("weekDayLabel", () => {
  it("names the day and date, rolling over the month and year", () => {
    const sunday = { year: 2026, month: 11, day: 15 };
    expect(weekDayLabel(sunday, 0)).toBe("Sun 15 Nov");
    expect(weekDayLabel(sunday, 6)).toBe("Sat 21 Nov");
    expect(weekDayLabel({ year: 2026, month: 12, day: 27 }, 6)).toBe("Sat 2 Jan");
  });
});

describe("buildWeeklyCelebrantList", () => {
  const sunday = { year: 2026, month: 11, day: 15 };
  it("groups people under their day, days in order, on one line", () => {
    const list = buildWeeklyCelebrantList(sunday, [
      { offset: 4, name: "Thomas & Anjali", occasionLabel: "Wedding Anniversary" },
      { offset: 0, name: "Priya Nair", occasionLabel: "Birthday" },
      { offset: 4, name: "Mary Joseph", occasionLabel: "Birthday" },
    ]);
    expect(list).toBe("Sun 15 Nov: Priya Nair — Birthday; Thu 19 Nov: Mary Joseph — Birthday, Thomas & Anjali — Wedding Anniversary");
    expect(list).not.toMatch(/[\n\t]/);
    expect(list).not.toMatch(/ {4}/);
  });
  it("is empty when nobody is celebrating", () => {
    expect(buildWeeklyCelebrantList(sunday, [])).toBe("");
  });
  it("stays under the WhatsApp parameter limit, says how many more, and keeps whole days", () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({ offset: i % 7, name: `Member Number ${i}`, occasionLabel: "Birthday" }));
    const list = buildWeeklyCelebrantList(sunday, entries);
    expect(list.length).toBeLessThanOrEqual(1024);
    expect(list.length).toBeLessThanOrEqual(WEEKLY_LIST_MAX_CHARS + 30);
    expect(list).toMatch(/\.\.\.and \d+ more$/);
    const more = Number(/and (\d+) more$/.exec(list)![1]);
    const shown = (list.match(/Birthday/g) ?? []).length;
    expect(shown + more).toBe(60);
  });
  it("copes with one day that is too long by itself", () => {
    const entries = Array.from({ length: 80 }, (_, i) => ({ offset: 0, name: `A Rather Long Member Name ${i}`, occasionLabel: "Wedding Anniversary" }));
    const list = buildWeeklyCelebrantList(sunday, entries);
    expect(list.length).toBeLessThanOrEqual(1024);
    expect(list.startsWith("Sun 15 Nov:")).toBe(true);
    expect(list).toMatch(/\.\.\.and \d+ more$/);
  });
});

describe("buildWeeklyIdempotencyKey", () => {
  it("is the same for two runs on the same Sunday and differs from the daily digest and from next week", () => {
    const a = buildWeeklyIdempotencyKey("automation-1", new Date("2026-11-15T01:00:00Z"));
    expect(a).toBe(buildWeeklyIdempotencyKey("automation-1", new Date("2026-11-15T09:00:00Z")));
    expect(a).not.toBe(buildWeeklyIdempotencyKey("automation-1", new Date("2026-11-22T01:00:00Z")));
    expect(a).not.toBe(buildDigestIdempotencyKey("automation-1", new Date("2026-11-15T01:00:00Z")));
  });
});
