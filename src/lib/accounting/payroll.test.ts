import { describe, expect, it } from "vitest";
import { addMonths, budgetPercent, budgetState, isMonthKey, monthsToYearEnd, netPay, parseBudgetAmount, validateEmployee, validateEntry } from "@/lib/accounting/payroll";

describe("month keys", () => {
  it("recognises YYYY-MM only", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
  });
  it("moves across year ends", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("lists the rest of the year", () => {
    expect(monthsToYearEnd("2026-11")).toEqual(["2026-11", "2026-12"]);
    expect(monthsToYearEnd("2026-01")).toHaveLength(12);
  });
});

describe("netPay", () => {
  it("adds allowances and takes off deductions", () => {
    expect(netPay(20000, 2000, 1500)).toBe(20500);
  });
  it("never goes below zero", () => {
    expect(netPay(1000, 0, 5000)).toBe(0);
  });
});

describe("validateEmployee", () => {
  it("needs a name and a salary", () => {
    const { errors } = validateEmployee({ name: "A", monthlySalary: "", defaultAllowances: "", defaultDeductions: "" });
    expect(errors.name).toBeTruthy();
    expect(errors.monthlySalary).toBeTruthy();
  });
  it("accepts blanks for allowances and deductions", () => {
    const r = validateEmployee({ name: "Ruth", monthlySalary: "15000", defaultAllowances: "", defaultDeductions: "" });
    expect(r.errors).toEqual({});
    expect(r.salary).toBe(15000);
  });
  it("rejects negatives", () => {
    expect(validateEmployee({ name: "Ruth", monthlySalary: "-1", defaultAllowances: "", defaultDeductions: "" }).errors.monthlySalary).toBeTruthy();
  });
});

describe("validateEntry", () => {
  it("works out the net pay", () => {
    expect(validateEntry({ basic: "10000", allowances: "500", deductions: "250" }).net).toBe(10250);
  });
  it("rejects deductions larger than the pay", () => {
    expect(validateEntry({ basic: "1000", allowances: "0", deductions: "2000" }).errors.deductions).toBeTruthy();
  });
});

describe("budget", () => {
  it("flags the state of a category", () => {
    expect(budgetState({ budget: 1000, actual: 100 })).toBe("ok");
    expect(budgetState({ budget: 1000, actual: 900 })).toBe("near");
    expect(budgetState({ budget: 1000, actual: 1001 })).toBe("over");
    expect(budgetState({ budget: 0, actual: 0 })).toBe("unbudgeted");
    expect(budgetState({ budget: 0, actual: 50 })).toBe("over");
  });
  it("caps the bar at 100%", () => {
    expect(budgetPercent({ budget: 100, actual: 250 })).toBe(100);
    expect(budgetPercent({ budget: 200, actual: 50 })).toBe(25);
  });
  it("parses amounts", () => {
    expect(parseBudgetAmount("")).toBe(0);
    expect(parseBudgetAmount("1200.5")).toBe(1200.5);
    expect(parseBudgetAmount("abc")).toBeNull();
    expect(parseBudgetAmount("-5")).toBeNull();
  });
});
