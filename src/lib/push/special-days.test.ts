import { describe, expect, it } from "vitest";
import { buildSpecialDayDigest, findSpecialDays, isOnThisDay, specialDayMessage } from "@/lib/push/special-days";

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

describe("buildSpecialDayDigest", () => {
  const person = (first_name: string, over: { date_of_birth?: string | null; wedding_date?: string | null } = {}) => ({
    first_name,
    last_name: "Thomas",
    date_of_birth: null,
    wedding_date: null,
    ...over,
  });

  it("says there are no special days when nobody has one", () => {
    const digest = buildSpecialDayDigest([person("Asha", { date_of_birth: "1990-01-01" })], "2026-05-14");
    expect(digest.title).toBe("No special days today");
    expect(digest.hasCelebrations).toBe(false);
  });

  it("lists birthdays and anniversaries, including members without the app", () => {
    const digest = buildSpecialDayDigest(
      [person("Asha", { date_of_birth: "1990-05-14" }), person("Ben", { wedding_date: "2010-05-14" }), person("Cara", { date_of_birth: "1985-06-01" })],
      "2026-05-14",
    );
    expect(digest.hasCelebrations).toBe(true);
    expect(digest.title).toContain("(2)");
    expect(digest.body).toBe("Birthdays: Asha Thomas. Anniversaries: Ben Thomas.");
  });

  it("shortens a long list", () => {
    const many = Array.from({ length: 9 }, (_, i) => person(`P${i}`, { date_of_birth: "1990-05-14" }));
    expect(buildSpecialDayDigest(many, "2026-05-14").body).toContain("and 3 more");
  });
});
