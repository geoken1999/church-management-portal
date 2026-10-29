"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { requireFinancePlan } from "@/lib/finance/actions";
import { dateKeyInTimezone } from "@/lib/organizations/timezone";
import { getOrganizationTimezone } from "@/lib/organizations/org-timezone";
import { EXPENSE_PAYMENT_METHODS } from "@/lib/accounting/validation";
import { isMonthKey, monthsToYearEnd, netPay, parseBudgetAmount, validateEmployee, validateEntry, type MoneyFieldErrors } from "@/lib/accounting/payroll";
import type { ExpensePaymentMethod } from "@/types/database";

const ACCOUNTING_PATH = "/dashboard/accounting";
const PAYROLL_PATH = "/dashboard/accounting/payroll";
const BUDGET_PATH = "/dashboard/accounting/budget";

export interface PayrollActionResult {
  error?: string;
  fieldErrors?: MoneyFieldErrors;
  success?: boolean;
}

type Level = "read" | "write" | "delete";

// Every payroll and budget action starts here: signed in, Finance on the plan, and the right level on Accounting.
async function authorize(organizationId: string, level: Level): Promise<{ userId: string } | { error: string }> {
  const user = await requireUser();
  if (!organizationId) return { error: "Something went wrong. Please reload the page." };
  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, "accounting", level);
  if (!access.ok) return { error: access.message };
  return { userId: user.id };
}

async function ownedBy(table: "payroll_employees" | "payroll_runs" | "payroll_entries", id: string): Promise<string | null> {
  const { data } = await createAdminClient().from(table).select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export interface EmployeeForm {
  organizationId: string;
  id?: string;
  name: string;
  jobTitle: string;
  branchId: string;
  monthlySalary: string;
  defaultAllowances: string;
  defaultDeductions: string;
  joinedOn: string;
  active: boolean;
  notes: string;
}

export async function saveEmployee(form: EmployeeForm): Promise<PayrollActionResult> {
  const auth = await authorize(form.organizationId, "write");
  if ("error" in auth) return { error: auth.error };

  const { errors, salary, allowances, deductions } = validateEmployee(form);
  if (Object.values(errors).some(Boolean)) return { fieldErrors: errors };

  const admin = createAdminClient();
  const row = {
    name: form.name.trim(),
    job_title: form.jobTitle.trim() || null,
    branch_id: form.branchId || null,
    monthly_salary: salary,
    default_allowances: allowances,
    default_deductions: deductions,
    joined_on: form.joinedOn || null,
    active: form.active,
    notes: form.notes.trim() || null,
  };

  if (form.id) {
    if ((await ownedBy("payroll_employees", form.id)) !== form.organizationId) return { error: "That person could not be found." };
    const { error } = await admin.from("payroll_employees").update(row).eq("id", form.id);
    if (error) return { error: "Couldn't save those changes. Please try again." };
  } else {
    const { error } = await admin.from("payroll_employees").insert({ organization_id: form.organizationId, ...row });
    if (error) return { error: "Couldn't add that person. Please try again." };
  }

  revalidatePath(PAYROLL_PATH);
  return { success: true };
}

export async function deleteEmployee(organizationId: string, id: string): Promise<PayrollActionResult> {
  const auth = await authorize(organizationId, "delete");
  if ("error" in auth) return { error: auth.error };
  if ((await ownedBy("payroll_employees", id)) !== organizationId) return { error: "That person could not be found." };
  // Past payslips keep their copy of the name, so removing someone doesn't change history.
  const { error } = await createAdminClient().from("payroll_employees").delete().eq("id", id);
  if (error) return { error: "Couldn't remove that person." };
  revalidatePath(PAYROLL_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Payroll runs
// ---------------------------------------------------------------------------

export async function createPayrollRun(organizationId: string, payMonth: string): Promise<PayrollActionResult & { runId?: string }> {
  const auth = await authorize(organizationId, "write");
  if ("error" in auth) return { error: auth.error };
  if (!isMonthKey(payMonth)) return { error: "Pick a valid month." };

  const admin = createAdminClient();
  const { data: employees } = await admin.from("payroll_employees").select("*").eq("organization_id", organizationId).eq("active", true).order("name", { ascending: true });
  if (!employees || employees.length === 0) return { error: "Add at least one active person before running payroll." };

  const { data: run, error } = await admin
    .from("payroll_runs")
    .insert({ organization_id: organizationId, pay_month: payMonth, created_by: auth.userId })
    .select("id")
    .single();
  if (error || !run) {
    return { error: error?.code === "23505" ? "Payroll for that month already exists." : "Couldn't start that payroll. Please try again." };
  }

  const { error: entriesError } = await admin.from("payroll_entries").insert(
    employees.map((e) => ({
      run_id: run.id,
      organization_id: organizationId,
      employee_id: e.id,
      employee_name: e.name,
      job_title: e.job_title,
      basic: e.monthly_salary,
      allowances: e.default_allowances,
      deductions: e.default_deductions,
      net: netPay(e.monthly_salary, e.default_allowances, e.default_deductions),
    })),
  );
  if (entriesError) {
    await admin.from("payroll_runs").delete().eq("id", run.id);
    return { error: "Couldn't start that payroll. Please try again." };
  }

  revalidatePath(PAYROLL_PATH);
  return { success: true, runId: run.id };
}

export async function updatePayrollEntry(entryId: string, form: { basic: string; allowances: string; deductions: string }): Promise<PayrollActionResult> {
  const organizationId = await ownedBy("payroll_entries", entryId);
  if (!organizationId) return { error: "That payslip could not be found." };
  const auth = await authorize(organizationId, "write");
  if ("error" in auth) return { error: auth.error };

  const { errors, basic, allowances, deductions, net } = validateEntry(form);
  if (Object.values(errors).some(Boolean)) return { fieldErrors: errors };

  const admin = createAdminClient();
  const { data: entry } = await admin.from("payroll_entries").select("run_id").eq("id", entryId).maybeSingle();
  const { data: run } = await admin.from("payroll_runs").select("status").eq("id", entry?.run_id ?? "").maybeSingle();
  if (run?.status !== "draft") return { error: "A paid payroll can't be changed." };

  const { error } = await admin.from("payroll_entries").update({ basic, allowances, deductions, net }).eq("id", entryId);
  if (error) return { error: "Couldn't save those changes. Please try again." };
  revalidatePath(PAYROLL_PATH);
  return { success: true };
}

export async function removePayrollEntry(entryId: string): Promise<PayrollActionResult> {
  const organizationId = await ownedBy("payroll_entries", entryId);
  if (!organizationId) return { error: "That payslip could not be found." };
  const auth = await authorize(organizationId, "delete");
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { data: entry } = await admin.from("payroll_entries").select("run_id").eq("id", entryId).maybeSingle();
  const { data: run } = await admin.from("payroll_runs").select("status").eq("id", entry?.run_id ?? "").maybeSingle();
  if (run?.status !== "draft") return { error: "A paid payroll can't be changed." };

  await admin.from("payroll_entries").delete().eq("id", entryId);
  revalidatePath(PAYROLL_PATH);
  return { success: true };
}

export async function deletePayrollRun(runId: string): Promise<PayrollActionResult> {
  const organizationId = await ownedBy("payroll_runs", runId);
  if (!organizationId) return { error: "That payroll could not be found." };
  const auth = await authorize(organizationId, "delete");
  if ("error" in auth) return { error: auth.error };

  const { data: removed } = await createAdminClient().from("payroll_runs").delete().eq("id", runId).eq("status", "draft").select("id");
  if (!removed || removed.length === 0) return { error: "Only a payroll that hasn't been paid can be deleted." };
  revalidatePath(PAYROLL_PATH);
  return { success: true };
}

const SALARIES_CATEGORY = "Salaries";

async function salariesCategoryId(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("accounting_categories").select("id").eq("organization_id", organizationId).eq("type", "expense").eq("name", SALARIES_CATEGORY).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await admin.from("accounting_categories").insert({ organization_id: organizationId, name: SALARIES_CATEGORY, type: "expense" }).select("id").single();
  return created?.id ?? null;
}

// Marks the payroll paid and records one expense per person, so Accounting and the Budget see the salaries.
export async function markPayrollPaid(runId: string, paidOn: string, paymentMethod: string): Promise<PayrollActionResult> {
  const organizationId = await ownedBy("payroll_runs", runId);
  if (!organizationId) return { error: "That payroll could not be found." };
  const auth = await authorize(organizationId, "write");
  if ("error" in auth) return { error: auth.error };

  const today = dateKeyInTimezone(new Date(), await getOrganizationTimezone(organizationId));
  if (!paidOn) return { error: "Pick the date the salaries were paid." };
  if (paidOn > today) return { error: "The paid date can't be in the future." };
  const method = (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(paymentMethod) ? (paymentMethod as ExpensePaymentMethod) : "bank_transfer";

  const admin = createAdminClient();
  const { data: run } = await admin.from("payroll_runs").select("pay_month").eq("id", runId).maybeSingle();
  const { data: entries } = await admin.from("payroll_entries").select("id, employee_name, net").eq("run_id", runId);
  if (!run || !entries || entries.length === 0) return { error: "There is nobody on this payroll." };

  // Claim the run first (only a draft can be claimed), so a double click can't pay twice.
  const { data: claimed } = await admin
    .from("payroll_runs")
    .update({ status: "paid", paid_on: paidOn, payment_method: method })
    .eq("id", runId)
    .eq("status", "draft")
    .select("id");
  if (!claimed || claimed.length === 0) return { error: "This payroll has already been paid." };

  const undo = async (expenseIds: string[]) => {
    if (expenseIds.length > 0) await admin.from("expenses").delete().in("id", expenseIds);
    await admin.from("payroll_runs").update({ status: "draft", paid_on: null, payment_method: null }).eq("id", runId);
    await admin.from("payroll_entries").update({ expense_id: null }).eq("run_id", runId);
  };

  const categoryId = await salariesCategoryId(organizationId);
  if (!categoryId) {
    await undo([]);
    return { error: "Couldn't set up the Salaries category. Please try again." };
  }

  const paying = entries.filter((e) => e.net > 0);
  const { data: expenses, error } = await admin
    .from("expenses")
    .insert(
      paying.map((e) => ({
        organization_id: organizationId,
        category_id: categoryId,
        amount: e.net,
        payee: e.employee_name,
        expense_date: paidOn,
        payment_method: method,
        notes: `Salary for ${run.pay_month}`,
        recorded_by: auth.userId,
      })),
    )
    .select("id");
  if (error || !expenses || expenses.length !== paying.length) {
    await undo((expenses ?? []).map((x) => x.id));
    return { error: "Couldn't record the salaries. Nothing was marked as paid." };
  }
  // The insert returns rows in the order they were given.
  for (const [i, entry] of paying.entries()) {
    await admin.from("payroll_entries").update({ expense_id: expenses[i].id }).eq("id", entry.id);
  }

  revalidatePath(PAYROLL_PATH);
  revalidatePath(ACCOUNTING_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export async function saveBudget(organizationId: string, month: string, lines: { categoryId: string; amount: string }[]): Promise<PayrollActionResult> {
  const auth = await authorize(organizationId, "write");
  if ("error" in auth) return { error: auth.error };
  if (!isMonthKey(month)) return { error: "Pick a valid month." };

  const admin = createAdminClient();
  const { data: categories } = await admin.from("accounting_categories").select("id").eq("organization_id", organizationId).eq("type", "expense");
  const valid = new Set((categories ?? []).map((c) => c.id));

  const keep: { organization_id: string; budget_month: string; category_id: string; amount: number }[] = [];
  const clear: string[] = [];
  for (const line of lines) {
    if (!valid.has(line.categoryId)) continue;
    const amount = parseBudgetAmount(line.amount);
    if (amount === null) return { error: "Budget amounts must be numbers, zero or more." };
    if (amount === 0) clear.push(line.categoryId);
    else keep.push({ organization_id: organizationId, budget_month: month, category_id: line.categoryId, amount });
  }

  if (keep.length > 0) {
    const { error } = await admin.from("budget_lines").upsert(keep, { onConflict: "organization_id,budget_month,category_id" });
    if (error) return { error: "Couldn't save the budget. Please try again." };
  }
  if (clear.length > 0) {
    await admin.from("budget_lines").delete().eq("organization_id", organizationId).eq("budget_month", month).in("category_id", clear);
  }

  revalidatePath(BUDGET_PATH);
  return { success: true };
}

async function copyLines(organizationId: string, fromMonth: string, toMonths: string[]): Promise<boolean> {
  const admin = createAdminClient();
  const { data: source } = await admin.from("budget_lines").select("category_id, amount").eq("organization_id", organizationId).eq("budget_month", fromMonth);
  if (!source || source.length === 0) return false;
  const rows = toMonths.flatMap((month) => source.map((s) => ({ organization_id: organizationId, budget_month: month, category_id: s.category_id, amount: s.amount })));
  await admin.from("budget_lines").upsert(rows, { onConflict: "organization_id,budget_month,category_id" });
  return true;
}

export async function copyBudgetFromMonth(organizationId: string, fromMonth: string, toMonth: string): Promise<PayrollActionResult> {
  const auth = await authorize(organizationId, "write");
  if ("error" in auth) return { error: auth.error };
  if (!isMonthKey(fromMonth) || !isMonthKey(toMonth)) return { error: "Pick a valid month." };
  if (!(await copyLines(organizationId, fromMonth, [toMonth]))) return { error: "There is no budget in that month to copy." };
  revalidatePath(BUDGET_PATH);
  return { success: true };
}

// Repeats this month's budget in every later month of the same year.
export async function applyBudgetToYear(organizationId: string, month: string): Promise<PayrollActionResult> {
  const auth = await authorize(organizationId, "write");
  if ("error" in auth) return { error: auth.error };
  if (!isMonthKey(month)) return { error: "Pick a valid month." };
  const later = monthsToYearEnd(month).slice(1);
  if (later.length === 0) return { error: "That is the last month of the year." };
  if (!(await copyLines(organizationId, month, later))) return { error: "Save a budget for this month first." };
  revalidatePath(BUDGET_PATH);
  return { success: true };
}
