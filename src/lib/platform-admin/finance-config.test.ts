import { describe, expect, it } from "vitest";
import { isPlatformServiceKey, monthKeyOfDate, recentMonthKeys, validateExpenseInput } from "@/lib/platform-admin/finance-config";

describe("monthKeyOfDate", () => {
  it("reads a plain date as its own month", () => {
    expect(monthKeyOfDate("2026-03-31")).toBe("2026-03");
  });

  it("buckets a timestamp in Indian time, not UTC", () => {
    // 2026-03-31 20:00 UTC is already 1 April in India (UTC+5:30).
    expect(monthKeyOfDate("2026-03-31T20:00:00Z")).toBe("2026-04");
    expect(monthKeyOfDate("2026-03-31T10:00:00Z")).toBe("2026-03");
  });
});

describe("recentMonthKeys", () => {
  it("returns the last N months oldest first, ending with the current month", () => {
    const now = new Date("2026-02-15T06:00:00Z");
    expect(recentMonthKeys(now, 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("wraps across a year boundary", () => {
    expect(recentMonthKeys(new Date("2026-01-10T06:00:00Z"), 2)).toEqual(["2025-12", "2026-01"]);
  });
});

describe("validateExpenseInput", () => {
  const valid = { service: "supabase", description: "Pro plan", amount: 2000, paidOn: "2026-05-01" };

  it("accepts a complete entry", () => {
    expect(validateExpenseInput(valid)).toEqual({});
  });

  it("rejects an unknown service", () => {
    expect(validateExpenseInput({ ...valid, service: "unknown" }).service).toBeDefined();
  });

  it("requires a description", () => {
    expect(validateExpenseInput({ ...valid, description: "   " }).description).toBeDefined();
  });

  it("rejects zero, negative and non-numeric amounts", () => {
    expect(validateExpenseInput({ ...valid, amount: 0 }).amount).toBeDefined();
    expect(validateExpenseInput({ ...valid, amount: -5 }).amount).toBeDefined();
    expect(validateExpenseInput({ ...valid, amount: Number.NaN }).amount).toBeDefined();
  });

  it("rejects a malformed or impossible date", () => {
    expect(validateExpenseInput({ ...valid, paidOn: "01/05/2026" }).paidOn).toBeDefined();
    expect(validateExpenseInput({ ...valid, paidOn: "2026-13-45" }).paidOn).toBeDefined();
  });

  it("recognises service keys", () => {
    expect(isPlatformServiceKey("meta_whatsapp")).toBe(true);
    expect(isPlatformServiceKey("bogus")).toBe(false);
  });
});
