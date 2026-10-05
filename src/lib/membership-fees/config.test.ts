import { describe, expect, it } from "vitest";
import {
  shiftMembershipPeriod,
  isMembershipDueDay,
  membershipPeriodFor,
  summarizeMembershipPeriod,
  validateMembershipFeeSettings,
} from "@/lib/membership-fees/config";

const base = { enabled: true, amount: 100, dueDay: 1, reminderAfterDays: 7 };

describe("validateMembershipFeeSettings", () => {
  it("accepts a complete setup", () => {
    expect(validateMembershipFeeSettings(base)).toEqual({});
  });

  it("won't turn the fee on without an amount", () => {
    expect(validateMembershipFeeSettings({ ...base, amount: null }).amount).toBeDefined();
  });

  it("allows an unset amount while the fee is off", () => {
    expect(validateMembershipFeeSettings({ ...base, enabled: false, amount: null })).toEqual({});
  });

  it("rejects zero and negative amounts even when off", () => {
    expect(validateMembershipFeeSettings({ ...base, enabled: false, amount: 0 }).amount).toBeDefined();
    expect(validateMembershipFeeSettings({ ...base, amount: -10 }).amount).toBeDefined();
  });

  it("keeps the due day within 1-28 so every month has it", () => {
    expect(validateMembershipFeeSettings({ ...base, dueDay: 29 }).dueDay).toBeDefined();
    expect(validateMembershipFeeSettings({ ...base, dueDay: 0 }).dueDay).toBeDefined();
    expect(validateMembershipFeeSettings({ ...base, dueDay: 28 })).toEqual({});
  });

  it("checks the reminder window", () => {
    expect(validateMembershipFeeSettings({ ...base, reminderAfterDays: 0 }).reminderAfterDays).toBeDefined();
    expect(validateMembershipFeeSettings({ ...base, reminderAfterDays: 29 }).reminderAfterDays).toBeDefined();
  });
});

describe("due day and period in the organization's timezone", () => {
  it("fires on the due day in the church's own timezone, not UTC", () => {
    // 2026-06-30 20:00 UTC is 1 July in India.
    const now = new Date("2026-06-30T20:00:00Z");
    expect(isMembershipDueDay(now, "Asia/Kolkata", 1)).toBe(true);
    expect(isMembershipDueDay(now, "UTC", 1)).toBe(false);
  });

  it("names the period from local time", () => {
    expect(membershipPeriodFor(new Date("2026-06-30T20:00:00Z"), "Asia/Kolkata")).toBe("2026-07");
    expect(membershipPeriodFor(new Date("2026-06-30T20:00:00Z"), "UTC")).toBe("2026-06");
  });
});

describe("summarizeMembershipPeriod", () => {
  it("separates collected, outstanding and cancelled requests", () => {
    const summary = summarizeMembershipPeriod([
      { amount: 100, status: "paid", hasEmail: true },
      { amount: 100, status: "paid", hasEmail: true },
      { amount: 100, status: "due", hasEmail: true },
      { amount: 100, status: "due", hasEmail: false },
      { amount: 100, status: "cancelled", hasEmail: true },
    ]);
    expect(summary).toEqual({
      requested: 4,
      expected: 400,
      collected: 200,
      outstanding: 200,
      paidCount: 2,
      dueCount: 2,
      withoutEmailCount: 1,
    });
  });

  it("is all zeros for a month with no requests", () => {
    expect(summarizeMembershipPeriod([])).toEqual({
      requested: 0,
      expected: 0,
      collected: 0,
      outstanding: 0,
      paidCount: 0,
      dueCount: 0,
      withoutEmailCount: 0,
    });
  });
});

describe("shiftMembershipPeriod", () => {
  it("moves forward and back across a year boundary", () => {
    expect(shiftMembershipPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftMembershipPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftMembershipPeriod("2026-07", 0)).toBe("2026-07");
  });
});
