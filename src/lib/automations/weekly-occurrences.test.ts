import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { findWeekOccurrencesForTrigger } = await import("./eligibility");

// A stand-in for the database client: answers the three questions the function asks (the church's timezone, its members, a custom field's key).
function fakeAdmin(members: Record<string, unknown>[], timezone = "Asia/Kolkata", fieldKey: string | null = null) {
  const query = (table: string) => {
    const state = { table, wedding: false };
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = self;
    builder.eq = (column: string, value: unknown) => { if (column === "marital_status" && value === "married") state.wedding = true; return builder; };
    builder.not = self;
    builder.maybeSingle = async () => (table === "organizations" ? { data: { timezone } } : { data: fieldKey ? { key: fieldKey, field_type: "date" } : null });
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: members.filter((m) => !state.wedding || m.marital_status === "married") });
    return builder;
  };
  return { from: query } as never;
}

const base = { id: "t1", automation_id: "a1", organization_id: "o1", occasion_label: "Birthday", days_offset: 1, is_active: true } as const;
const member = (id: string, extra: Record<string, unknown>) => ({ id, first_name: id, last_name: "X", marital_status: "single", custom_fields: {}, ...extra });

describe("findWeekOccurrencesForTrigger", () => {
  // Sunday 15 Nov 2026, 06:30 in India.
  const sunday = new Date("2026-11-15T01:00:00Z");

  it("finds a birthday on each day of the week from Sunday to Saturday, with the day it falls on, and none outside it", async () => {
    const trigger = { ...base, date_field_source: "built_in", built_in_field: "date_of_birth", date_field_id: null } as never;
    const admin = fakeAdmin([
      member("Sun", { date_of_birth: "1990-11-15" }),
      member("Wed", { date_of_birth: "1985-11-18" }),
      member("Sat", { date_of_birth: "2001-11-21" }),
      member("NextSunday", { date_of_birth: "1990-11-22" }),
      member("Yesterday", { date_of_birth: "1990-11-14" }),
    ]);
    const found = await findWeekOccurrencesForTrigger(admin, trigger, sunday);
    expect(found.map((f) => [f.offset, (f.member as { id: string }).id])).toEqual([[0, "Sun"], [3, "Wed"], [6, "Sat"]]);
  });

  it("ignores the trigger's own days-before setting: the week lists the special days themselves", async () => {
    const admin = fakeAdmin([member("Sun", { date_of_birth: "1990-11-15" })]);
    for (const days_offset of [0, 1, 7]) {
      const found = await findWeekOccurrencesForTrigger(admin, { ...base, days_offset, date_field_source: "built_in", built_in_field: "date_of_birth", date_field_id: null } as never, sunday);
      expect(found.map((f) => f.offset)).toEqual([0]);
    }
  });

  it("counts wedding anniversaries of married members only, and rolls over a month end", async () => {
    const trigger = { ...base, occasion_label: "Wedding Anniversary", date_field_source: "built_in", built_in_field: "wedding_date", date_field_id: null } as never;
    const admin = fakeAdmin([
      member("Married", { wedding_date: "2010-11-30", marital_status: "married" }),
      member("NotMarried", { wedding_date: "2010-11-17", marital_status: "single" }),
    ]);
    const found = await findWeekOccurrencesForTrigger(admin, trigger, new Date("2026-11-29T01:00:00Z")); // Sunday 29 Nov: the week reaches 5 Dec
    expect(found.map((f) => [f.offset, (f.member as { id: string }).id, f.occasionLabel])).toEqual([[1, "Married", "Wedding Anniversary"]]);
  });

  it("uses the church's timezone for which day is today", async () => {
    const trigger = { ...base, date_field_source: "built_in", built_in_field: "date_of_birth", date_field_id: null } as never;
    // 20:00 UTC on Saturday 14 Nov is already Sunday 15 Nov in India, but still Saturday in New York.
    const when = new Date("2026-11-14T20:00:00Z");
    const members = [member("Sun", { date_of_birth: "1990-11-15" })];
    expect((await findWeekOccurrencesForTrigger(fakeAdmin(members, "Asia/Kolkata"), trigger, when)).map((f) => f.offset)).toEqual([0]);
    expect((await findWeekOccurrencesForTrigger(fakeAdmin(members, "America/New_York"), trigger, when)).map((f) => f.offset)).toEqual([1]);
  });

  it("works for a custom date field, and for a trigger with no field set", async () => {
    const admin = fakeAdmin([member("Bap", { custom_fields: { baptism_date: "2015-11-17" } })], "Asia/Kolkata", "baptism_date");
    const custom = { ...base, occasion_label: "Baptism", date_field_source: "custom_field", built_in_field: null, date_field_id: "f1" } as never;
    expect((await findWeekOccurrencesForTrigger(admin, custom, sunday)).map((f) => [f.offset, f.occasionLabel])).toEqual([[2, "Baptism"]]);
    expect(await findWeekOccurrencesForTrigger(admin, { ...base, date_field_source: "built_in", built_in_field: null, date_field_id: null } as never, sunday)).toEqual([]);
  });

  it("treats a Feb 29 birthday as Feb 28 in a non-leap year, and as Feb 29 in a leap year", async () => {
    const trigger = { ...base, date_field_source: "built_in", built_in_field: "date_of_birth", date_field_id: null } as never;
    const admin = fakeAdmin([member("Leap", { date_of_birth: "1992-02-29" })]);
    // Sunday 28 Feb 2027 (a non-leap year): the Feb 29 birthday is celebrated that day.
    expect((await findWeekOccurrencesForTrigger(admin, trigger, new Date("2027-02-28T01:00:00Z"))).map((f) => f.offset)).toEqual([0]);
    // Sunday 27 Feb 2028 (a leap year): it is celebrated on the real Feb 29, two days later.
    expect((await findWeekOccurrencesForTrigger(admin, trigger, new Date("2028-02-27T01:00:00Z"))).map((f) => f.offset)).toEqual([2]);
  });
});
