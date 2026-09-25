import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { buildAccountingBuckets, bucketGranularityForRange, type DateRange } from "@/lib/accounting/period";

export const getAccountingCategories = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounting_categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  return data ?? [];
});

export const getExpenses = cache(async (organizationId: string, branchId?: string) => {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("*, branches(id, name), accounting_categories(id, name)")
    .eq("organization_id", organizationId)
    .order("expense_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data } = await query;
  return data ?? [];
});

interface IncomeRow {
  amount: number;
  category: string;
  date: string;
}

interface ExpenseRow {
  amount: number;
  category: string;
  date: string;
}

export interface AccountingCategoryBreakdown {
  category: string;
  amount: number;
}

export interface AccountingBucketTotal {
  key: string;
  label: string;
  income: number;
  expense: number;
}

export interface AccountingSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  incomeByCategory: AccountingCategoryBreakdown[];
  expenseByCategory: AccountingCategoryBreakdown[];
  series: AccountingBucketTotal[];
}

function inRangeIso(range: DateRange) {
  return { gte: range.start, lte: range.end };
}

function groupByCategory(rows: { amount: number; category: string }[]): AccountingCategoryBreakdown[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
  }
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

// Income isn't its own table — it's read straight from offerings (by
// their own free-text category) and donations (bucketed as a single
// "Donations" line, since a donation's real identity is its donor/
// fundraiser, not a chart-of-accounts category). Expenses are the one
// genuinely new ledger this module adds. Not cache()-wrapped: the range/
// branch combination varies per request, so memoizing would just hold
// stale results for the wrong filters.
export async function getAccountingSummary(
  organizationId: string,
  range: DateRange,
  branchId?: string,
): Promise<AccountingSummary> {
  const supabase = await createClient();
  const { gte, lte } = inRangeIso(range);

  let offeringsQuery = supabase
    .from("offerings")
    .select("amount, category, collected_on")
    .eq("organization_id", organizationId)
    .gte("collected_on", gte)
    .lte("collected_on", lte);
  if (branchId) offeringsQuery = offeringsQuery.eq("branch_id", branchId);

  const donationsQuery = supabase
    .from("donations")
    .select("amount, donated_on")
    .eq("organization_id", organizationId)
    .gte("donated_on", gte)
    .lte("donated_on", lte);
  // Donations don't carry a branch_id (they're tied to a member/donor, not
  // a location), so a branch filter can't narrow this query — it's
  // included in totals regardless of the selected branch.

  let expensesQuery = supabase
    .from("expenses")
    .select("amount, expense_date, accounting_categories(name)")
    .eq("organization_id", organizationId)
    .gte("expense_date", gte)
    .lte("expense_date", lte);
  if (branchId) expensesQuery = expensesQuery.eq("branch_id", branchId);

  const [{ data: offerings }, { data: donations }, { data: expenses }] = await Promise.all([
    offeringsQuery,
    donationsQuery,
    expensesQuery,
  ]);

  const incomeRows: IncomeRow[] = [
    ...(offerings ?? []).map((row) => ({ amount: row.amount, category: row.category, date: row.collected_on })),
    ...(donations ?? []).map((row) => ({ amount: row.amount, category: "Donations", date: row.donated_on })),
  ];
  const expenseRows: ExpenseRow[] = (expenses ?? []).map((row) => ({
    amount: row.amount,
    category: (row.accounting_categories as { name: string } | null)?.name ?? "Uncategorized",
    date: row.expense_date,
  }));

  const totalIncome = incomeRows.reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = expenseRows.reduce((sum, row) => sum + row.amount, 0);

  const granularity = bucketGranularityForRange(range);
  const buckets = buildAccountingBuckets(range, granularity);
  const series: AccountingBucketTotal[] = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    income: incomeRows.filter((row) => row.date >= bucket.start && row.date <= bucket.end).reduce((sum, row) => sum + row.amount, 0),
    expense: expenseRows.filter((row) => row.date >= bucket.start && row.date <= bucket.end).reduce((sum, row) => sum + row.amount, 0),
  }));

  return {
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    incomeByCategory: groupByCategory(incomeRows),
    expenseByCategory: groupByCategory(expenseRows),
    series,
  };
}

// ---------------------------------------------------------------------------
// Ledger — a printable, chronological statement with a running balance.
// Reads the same three sources as getAccountingSummary, plus everything
// before the range to compute a real opening balance rather than starting
// the ledger's balance column at a misleading 0.
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  date: string;
  type: "income" | "expense";
  description: string;
  category: string;
  amount: number;
  balance: number;
}

export interface LedgerResult {
  openingBalance: number;
  entries: LedgerEntry[];
  closingBalance: number;
}

async function fetchIncomeExpenseTotal(organizationId: string, before: string, branchId?: string): Promise<number> {
  const supabase = await createClient();

  let offeringsQuery = supabase.from("offerings").select("amount").eq("organization_id", organizationId).lt("collected_on", before);
  if (branchId) offeringsQuery = offeringsQuery.eq("branch_id", branchId);

  const donationsQuery = supabase.from("donations").select("amount").eq("organization_id", organizationId).lt("donated_on", before);

  let expensesQuery = supabase.from("expenses").select("amount").eq("organization_id", organizationId).lt("expense_date", before);
  if (branchId) expensesQuery = expensesQuery.eq("branch_id", branchId);

  const [{ data: offerings }, { data: donations }, { data: expenses }] = await Promise.all([offeringsQuery, donationsQuery, expensesQuery]);

  const income = (offerings ?? []).reduce((sum, row) => sum + row.amount, 0) + (donations ?? []).reduce((sum, row) => sum + row.amount, 0);
  const expense = (expenses ?? []).reduce((sum, row) => sum + row.amount, 0);
  return income - expense;
}

export async function getLedgerEntries(organizationId: string, range: DateRange, branchId?: string): Promise<LedgerResult> {
  const supabase = await createClient();
  const { gte, lte } = inRangeIso(range);

  let offeringsQuery = supabase
    .from("offerings")
    .select("amount, category, collected_on")
    .eq("organization_id", organizationId)
    .gte("collected_on", gte)
    .lte("collected_on", lte);
  if (branchId) offeringsQuery = offeringsQuery.eq("branch_id", branchId);

  const donationsQuery = supabase
    .from("donations")
    .select("amount, donated_on, donor_name, members(first_name, last_name)")
    .eq("organization_id", organizationId)
    .gte("donated_on", gte)
    .lte("donated_on", lte);

  let expensesQuery = supabase
    .from("expenses")
    .select("amount, expense_date, payee, accounting_categories(name)")
    .eq("organization_id", organizationId)
    .gte("expense_date", gte)
    .lte("expense_date", lte);
  if (branchId) expensesQuery = expensesQuery.eq("branch_id", branchId);

  const [{ data: offerings }, { data: donations }, { data: expenses }, openingBalance] = await Promise.all([
    offeringsQuery,
    donationsQuery,
    expensesQuery,
    fetchIncomeExpenseTotal(organizationId, range.start, branchId),
  ]);

  const rows: Omit<LedgerEntry, "balance">[] = [
    ...(offerings ?? []).map((row) => ({
      date: row.collected_on,
      type: "income" as const,
      description: `Offering — ${row.category}`,
      category: row.category,
      amount: row.amount,
    })),
    ...(donations ?? []).map((row) => {
      const member = row.members as { first_name: string; last_name: string } | null;
      const donor = member ? `${member.first_name} ${member.last_name}`.trim() : (row.donor_name ?? "Anonymous");
      return {
        date: row.donated_on,
        type: "income" as const,
        description: `Donation — ${donor}`,
        category: "Donations",
        amount: row.amount,
      };
    }),
    ...(expenses ?? []).map((row) => {
      const category = (row.accounting_categories as { name: string } | null)?.name ?? "Uncategorized";
      return {
        date: row.expense_date,
        type: "expense" as const,
        description: row.payee ? `${category} — ${row.payee}` : category,
        category,
        amount: row.amount,
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let balance = openingBalance;
  const entries: LedgerEntry[] = rows.map((row) => {
    balance += row.type === "income" ? row.amount : -row.amount;
    return { ...row, balance };
  });

  return { openingBalance, entries, closingBalance: balance };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const getInvoices = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("*, branches(id, name)")
    .eq("organization_id", organizationId)
    .order("issue_date", { ascending: false });

  return data ?? [];
});

export const getInvoice = cache(async (organizationId: string, invoiceId: string) => {
  const supabase = await createClient();
  const [{ data: invoice }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*, branches(id, name)").eq("organization_id", organizationId).eq("id", invoiceId).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order", { ascending: true }),
  ]);

  if (!invoice) return null;
  return { invoice, items: items ?? [] };
});

// Simple per-org sequential numbering (INV-0001, INV-0002, ...) — a
// count-based next-number rather than a database sequence, which is fine
// at a church's invoice volume; the unique (organization_id,
// invoice_number) constraint means a rare concurrent-creation collision
// fails the insert loudly instead of silently duplicating a number.
export async function getNextInvoiceNumber(organizationId: string): Promise<string> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  return `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;
}
