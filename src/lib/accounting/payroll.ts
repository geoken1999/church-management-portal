// Pure rules for payroll and the budget planner, shared by the server actions, the pages and the tests.

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** "YYYY-MM" for a date, in the church's own calendar (the caller passes a "YYYY-MM-DD" key). */
export function monthOfDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function addMonths(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Months from `monthKey` to December of the same year, inclusive. */
export function monthsToYearEnd(monthKey: string): string[] {
  const [year, month] = monthKey.split("-").map(Number);
  return Array.from({ length: 13 - month }, (_, i) => `${year}-${String(month + i).padStart(2, "0")}`);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Take-home pay: salary plus allowances minus deductions, never below zero. */
export function netPay(basic: number, allowances: number, deductions: number): number {
  return Math.max(0, roundMoney(basic + allowances - deductions));
}

export interface MoneyFieldErrors {
  [field: string]: string | undefined;
}

function parseMoney(raw: string, label: string, errors: MoneyFieldErrors, key: string, { required }: { required: boolean }): number {
  const text = raw.trim();
  if (!text) {
    if (required) errors[key] = `Enter ${label}.`;
    return 0;
  }
  const value = Number(text);
  if (Number.isNaN(value) || value < 0) {
    errors[key] = `${label[0].toUpperCase()}${label.slice(1)} can't be negative.`;
    return 0;
  }
  return roundMoney(value);
}

export interface EmployeeInput {
  name: string;
  monthlySalary: string;
  defaultAllowances: string;
  defaultDeductions: string;
}

export function validateEmployee(input: EmployeeInput): { errors: MoneyFieldErrors; salary: number; allowances: number; deductions: number } {
  const errors: MoneyFieldErrors = {};
  if (input.name.trim().length < 2) errors.name = "Give the person a name of at least 2 characters.";
  const salary = parseMoney(input.monthlySalary, "a monthly salary", errors, "monthlySalary", { required: true });
  const allowances = parseMoney(input.defaultAllowances, "allowances", errors, "defaultAllowances", { required: false });
  const deductions = parseMoney(input.defaultDeductions, "deductions", errors, "defaultDeductions", { required: false });
  return { errors, salary, allowances, deductions };
}

export interface EntryInput {
  basic: string;
  allowances: string;
  deductions: string;
}

export function validateEntry(input: EntryInput): { errors: MoneyFieldErrors; basic: number; allowances: number; deductions: number; net: number } {
  const errors: MoneyFieldErrors = {};
  const basic = parseMoney(input.basic, "a salary", errors, "basic", { required: true });
  const allowances = parseMoney(input.allowances, "allowances", errors, "allowances", { required: false });
  const deductions = parseMoney(input.deductions, "deductions", errors, "deductions", { required: false });
  if (!errors.deductions && deductions > basic + allowances) errors.deductions = "Deductions can't be more than the pay.";
  return { errors, basic, allowances, deductions, net: netPay(basic, allowances, deductions) };
}

export interface BudgetRowInput {
  budget: number;
  actual: number;
}

export type BudgetState = "unbudgeted" | "ok" | "near" | "over";

/** How a category is doing against its budget; "near" is 85% or more spent. */
export function budgetState({ budget, actual }: BudgetRowInput): BudgetState {
  if (budget <= 0) return actual > 0 ? "over" : "unbudgeted";
  if (actual > budget) return "over";
  return actual >= budget * 0.85 ? "near" : "ok";
}

export function budgetPercent({ budget, actual }: BudgetRowInput): number {
  if (budget <= 0) return actual > 0 ? 100 : 0;
  return Math.min(100, Math.round((actual / budget) * 100));
}

export function parseBudgetAmount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return 0;
  const value = Number(text);
  return Number.isNaN(value) || value < 0 ? null : roundMoney(value);
}
