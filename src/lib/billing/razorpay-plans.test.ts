import { describe, it, expect } from "vitest";
import {
  expectedChargePaise,
  planEnvVar,
  planMismatch,
  razorpayPlanIdFor,
  totalCountFor,
} from "./razorpay-plans";

describe("Razorpay plan ids", () => {
  it("names one variable per plan and cycle", () => {
    expect(planEnvVar("basic", "monthly")).toBe("RAZORPAY_PLAN_ID_BASIC");
    expect(planEnvVar("premium", "annual")).toBe("RAZORPAY_PLAN_ID_PREMIUM_ANNUAL");
    expect(planEnvVar("pro", "monthly")).toBe("RAZORPAY_PLAN_ID_PRO");
  });
  it("reads the id, ignoring blanks", () => {
    expect(razorpayPlanIdFor("pro", "annual", { RAZORPAY_PLAN_ID_PRO_ANNUAL: " plan_X1 " })).toBe("plan_X1");
    expect(razorpayPlanIdFor("pro", "annual", { RAZORPAY_PLAN_ID_PRO_ANNUAL: "  " })).toBeNull();
    expect(razorpayPlanIdFor("pro", "monthly", {})).toBeNull();
  });
});

describe("expected charge", () => {
  it("is the listed price plus 18% GST, in paise", () => {
    expect(expectedChargePaise("basic", "monthly")).toBe(176882); // 1,499 -> 1,768.82
    expect(expectedChargePaise("basic", "annual")).toBe(1769882); // 14,999 -> 17,698.82
    expect(expectedChargePaise("premium", "monthly")).toBe(353882); // 2,999 -> 3,538.82
    expect(expectedChargePaise("pro", "annual")).toBe(5899882); // 49,999 -> 58,998.82
  });
});

describe("planMismatch", () => {
  const ok = { period: "monthly", interval: 1, item: { amount: 176882, currency: "INR" } };
  it("accepts a matching plan", () => {
    expect(planMismatch(ok, "monthly", 176882)).toBeNull();
    expect(planMismatch({ ...ok, period: "yearly", item: { amount: 1769882, currency: "INR" } }, "annual", 1769882)).toBeNull();
  });
  it("refuses a wrong cycle, amount or currency", () => {
    expect(planMismatch({ ...ok, period: "yearly" }, "monthly", 176882)).toMatch(/not every 1 monthly/);
    expect(planMismatch({ ...ok, interval: 3 }, "monthly", 176882)).toMatch(/every 3/);
    expect(planMismatch({ ...ok, item: { amount: 149900, currency: "INR" } }, "monthly", 176882)).toMatch(/149900/);
    expect(planMismatch({ ...ok, item: { amount: 176882, currency: "USD" } }, "monthly", 176882)).toMatch(/USD/);
  });
});

describe("totalCountFor", () => {
  it("runs ten years either way", () => {
    expect(totalCountFor("monthly")).toBe(120);
    expect(totalCountFor("annual")).toBe(10);
  });
});
