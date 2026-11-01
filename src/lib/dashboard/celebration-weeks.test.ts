import { describe, expect, it } from "vitest";
import { mondayOf, placeInWeeks } from "./celebration-weeks";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("mondayOf", () => {
  it("finds the Monday of the week, treating Sunday as the last day", () => {
    expect(ymd(mondayOf(new Date(2026, 10, 2)))).toBe("2026-11-02"); // Monday
    expect(ymd(mondayOf(new Date(2026, 10, 4)))).toBe("2026-11-02"); // Wednesday
    expect(ymd(mondayOf(new Date(2026, 10, 8)))).toBe("2026-11-02"); // Sunday
    expect(ymd(mondayOf(new Date(2026, 10, 1)))).toBe("2026-10-26"); // Sunday 1 Nov
  });
});

describe("placeInWeeks", () => {
  // Wednesday 4 Nov 2026: this week is Mon 2 to Sun 8 Nov, next week Mon 9 to Sun 15 Nov.
  const today = new Date(2026, 10, 4);

  it("puts Monday to Sunday of the current week in this week, even days already gone", () => {
    expect(placeInWeeks("1990-11-02", today)?.week).toBe("thisWeek");
    expect(placeInWeeks("1990-11-04", today)?.week).toBe("thisWeek");
    expect(placeInWeeks("1990-11-08", today)?.week).toBe("thisWeek");
  });

  it("puts the following Monday to Sunday in next week", () => {
    expect(placeInWeeks("1990-11-09", today)?.week).toBe("nextWeek");
    expect(placeInWeeks("1990-11-15", today)?.week).toBe("nextWeek");
  });

  it("leaves out dates outside the two weeks", () => {
    expect(placeInWeeks("1990-11-01", today)).toBeNull();
    expect(placeInWeeks("1990-11-16", today)).toBeNull();
  });

  it("works across New Year", () => {
    const late = new Date(2026, 11, 30); // Wednesday: this week Mon 28 Dec to Sun 3 Jan
    expect(placeInWeeks("1990-01-02", late)).toMatchObject({ week: "thisWeek" });
    expect(ymd(placeInWeeks("1990-01-02", late)!.occurrence)).toBe("2027-01-02");
    expect(placeInWeeks("1990-01-06", late)?.week).toBe("nextWeek");
  });
});
