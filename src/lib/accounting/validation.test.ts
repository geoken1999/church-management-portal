import { describe, it, expect } from "vitest";
import { validateExpense, validateAccountingCategoryName } from "./validation";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("validateExpense", () => {
  it("rejects an empty amount", () => {
    expect(validateExpense({ amount: "", expenseDate: today() }).amount).toBeDefined();
  });

  it("rejects a zero or negative amount", () => {
    expect(validateExpense({ amount: "0", expenseDate: today() }).amount).toBeDefined();
    expect(validateExpense({ amount: "-5", expenseDate: today() }).amount).toBeDefined();
  });

  it("accepts a positive amount", () => {
    expect(validateExpense({ amount: "42.50", expenseDate: today() }).amount).toBeUndefined();
  });

  it("rejects a missing date", () => {
    expect(validateExpense({ amount: "10", expenseDate: "" }).expenseDate).toBeDefined();
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    expect(validateExpense({ amount: "10", expenseDate: iso }).expenseDate).toBeDefined();
  });

  it("accepts today's date", () => {
    expect(validateExpense({ amount: "10", expenseDate: today() }).expenseDate).toBeUndefined();
  });
});

describe("validateAccountingCategoryName", () => {
  it("rejects an empty name", () => {
    expect(validateAccountingCategoryName("")).toBeDefined();
  });

  it("rejects a one-character name", () => {
    expect(validateAccountingCategoryName("A")).toBeDefined();
  });

  it("accepts a valid name", () => {
    expect(validateAccountingCategoryName("Utilities")).toBeUndefined();
  });
});
