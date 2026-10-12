import { describe, expect, it } from "vitest";
import { findSpecialDays, isOnThisDay, specialDayMessage } from "@/lib/push/special-days";

const member = (over: Partial<Parameters<typeof findSpecialDays>[0][number]> = {}) => ({
  id: "m1",
  first_name: "Asha",
  auth_user_id: "u1",
  date_of_birth: null,
  wedding_date: null,
  ...over,
});

describe("isOnThisDay", () => {
  it("matches month and day in any year", () => {
    expect(isOnThisDay("1990-05-14", "2026-05-14")).toBe(true);
    expect(isOnThisDay("1990-05-14", "2026-05-15")).toBe(false);
    expect(isOnThisDay(null, "2026-05-14")).toBe(false);
  });
  it("celebrates 29 February on 28 February in a non-leap year", () => {
    expect(isOnThisDay("1992-02-29", "2026-02-28")).toBe(true);
    expect(isOnThisDay("1992-02-29", "2028-02-28")).toBe(false);
    expect(isOnThisDay("1992-02-29", "2028-02-29")).toBe(true);
  });
});

describe("findSpecialDays", () => {
  it("returns birthdays and anniversaries for members with an app account", () => {
    const hits = findSpecialDays([member({ date_of_birth: "1990-05-14", wedding_date: "2015-05-14" })], "2026-05-14");
    expect(hits.map((h) => h.kind)).toEqual(["birthday", "anniversary"]);
  });
  it("skips members without an app account", () => {
    expect(findSpecialDays([member({ auth_user_id: null, date_of_birth: "1990-05-14" })], "2026-05-14")).toEqual([]);
  });
});

describe("specialDayMessage", () => {
  it("names the member and church", () => {
    expect(specialDayMessage("birthday", "Asha", "Grace Church").title).toContain("Asha");
    expect(specialDayMessage("anniversary", "", "Grace Church").body).toContain("Grace Church");
  });
});
