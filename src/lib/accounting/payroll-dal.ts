import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { monthsToYearEnd } from "@/lib/accounting/payroll";
import type { PayrollEmployee, PayrollEntry, PayrollRun } from "@/types/database";

// Payroll tables have no row-level policies on purpose (they hold salaries), so these reads use the server
// client. Every caller has already checked the person's Accounting access.

export async function getPayrollEmployees(organizationId: string): Promise<PayrollEmployee[]> {
  const { data } = await createAdminClient().from("payroll_employees").select("*").eq("organization_id", organizationId).order("name", { ascending: true });
  return data ?? [];
}

export interface PayrollRunSummary extends PayrollRun {
  people: number;
  total: number;
}

export async function getPayrollRuns(organizationId: string): Promise<PayrollRunSummary[]> {
  const admin = createAdminClient();
  const [{ data: runs }, { data: entries }] = await Promise.all([
    admin.from("payroll_runs").select("*").eq("organization_id", organizationId).order("pay_month", { ascending: false }),
    admin.from("payroll_entries").select("run_id, net").eq("organization_id", organizationId),
  ]);
  const totals = new Map<string, { people: number; total: number }>();
  for (const e of entries ?? []) {
    const t = totals.get(e.run_id) ?? { people: 0, total: 0 };
    t.people += 1;
    t.total += e.net;
    totals.set(e.run_id, t);
  }
  return (runs ?? []).map((r) => ({ ...r, people: totals.get(r.id)?.people ?? 0, total: totals.get(r.id)?.total ?? 0 }));
}

export async function getPayrollRun(organizationId: string, runId: string): Promise<{ run: PayrollRun; entries: PayrollEntry[] } | null> {
  const admin = createAdminClient();
  const { data: run } = await admin.from("payroll_runs").select("*").eq("id", runId).eq("organization_id", organizationId).maybeSingle();
  if (!run) return null;
  const { data: entries } = await admin.from("payroll_entries").select("*").eq("run_id", runId).order("employee_name", { ascending: true });
  return { run, entries: entries ?? [] };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export interface BudgetCategoryRow {
  categoryId: string;
  name: string;
  budget: number;
  actual: number;
}

function monthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

// One row per expense category (budget and what was actually spent that month), plus anything spent with no category.
export async function getBudgetForMonth(organizationId: string, month: string): Promise<{ rows: BudgetCategoryRow[]; uncategorised: number }> {
  const admin = createAdminClient();
  const { start, end } = monthRange(month);
  const [{ data: categories }, { data: lines }, { data: expenses }] = await Promise.all([
    admin.from("accounting_categories").select("id, name").eq("organization_id", organizationId).eq("type", "expense").order("name", { ascending: true }),
    admin.from("budget_lines").select("category_id, amount").eq("organization_id", organizationId).eq("budget_month", month),
    admin.from("expenses").select("category_id, amount").eq("organization_id", organizationId).gte("expense_date", start).lte("expense_date", end),
  ]);
  const budgeted = new Map((lines ?? []).map((l) => [l.category_id, l.amount]));
  const spent = new Map<string | null, number>();
  for (const e of expenses ?? []) spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + e.amount);
  return {
    rows: (categories ?? []).map((c) => ({ categoryId: c.id, name: c.name, budget: budgeted.get(c.id) ?? 0, actual: spent.get(c.id) ?? 0 })),
    uncategorised: spent.get(null) ?? 0,
  };
}

/** Total budgeted and spent for each month from `month` to the end of its year, for the year strip. */
export async function getYearBudgetTotals(organizationId: string, month: string): Promise<{ month: string; budget: number }[]> {
  const year = month.slice(0, 4);
  const { data } = await createAdminClient().from("budget_lines").select("budget_month, amount").eq("organization_id", organizationId).like("budget_month", `${year}-%`);
  const byMonth = new Map<string, number>();
  for (const l of data ?? []) byMonth.set(l.budget_month, (byMonth.get(l.budget_month) ?? 0) + l.amount);
  return monthsToYearEnd(`${year}-01`).map((m) => ({ month: m, budget: byMonth.get(m) ?? 0 }));
}
