"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, CalendarRange, Save } from "lucide-react";
import { saveBudget, copyBudgetFromMonth, applyBudgetToYear } from "@/lib/accounting/payroll-actions";
import { addMonths, budgetPercent, budgetState, monthLabel, parseBudgetAmount, type BudgetState } from "@/lib/accounting/payroll";
import type { BudgetCategoryRow } from "@/lib/accounting/payroll-dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BAR_COLOR: Record<BudgetState, string> = {
  unbudgeted: "bg-muted-foreground/30",
  ok: "bg-emerald-500",
  near: "bg-amber-500",
  over: "bg-red-500",
};

export function BudgetManager({
  organizationId,
  month,
  rows,
  uncategorised,
  canWrite,
}: {
  organizationId: string;
  month: string;
  rows: BudgetCategoryRow[];
  uncategorised: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.categoryId, r.budget ? String(r.budget) : ""])));

  const parsed = rows.map((r) => ({ ...r, budget: parseBudgetAmount(amounts[r.categoryId] ?? "") ?? 0 }));
  const totalBudget = parsed.reduce((sum, r) => sum + r.budget, 0);
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0) + uncategorised;
  const dirty = rows.some((r) => (parseBudgetAmount(amounts[r.categoryId] ?? "") ?? 0) !== r.budget);

  function go(target: string) {
    router.push(`/dashboard/accounting/budget?month=${target}`);
  }

  function run(action: () => Promise<{ error?: string; success?: boolean }>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        setNotice(null);
      } else {
        setError(null);
        setNotice(message);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="Previous month" onClick={() => go(addMonths(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-44 text-center font-heading text-xl font-bold">{monthLabel(month)}</h2>
          <Button type="button" variant="outline" size="icon" aria-label="Next month" onClick={() => go(addMonths(month, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => copyBudgetFromMonth(organizationId, addMonths(month, -1), month), "Copied last month's budget.")}>
              <Copy className="size-4" />
              Copy last month
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || dirty}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() => {
                if (window.confirm(`Use this budget for every later month of ${month.slice(0, 4)}? It replaces any budget already set for those months.`)) run(() => applyBudgetToYear(organizationId, month), "Applied to the rest of the year.");
              }}
            >
              <CalendarRange className="size-4" />
              Repeat for the year
            </Button>
            <Button
              type="button"
              disabled={pending || !dirty}
              onClick={() => run(() => saveBudget(organizationId, month, rows.map((r) => ({ categoryId: r.categoryId, amount: amounts[r.categoryId] ?? "" }))), "Budget saved.")}
            >
              <Save className="size-4" />
              Save budget
            </Button>
          </div>
        )}
      </div>

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Budgeted", value: totalBudget },
          { label: "Spent", value: totalActual },
          { label: totalBudget - totalActual >= 0 ? "Left to spend" : "Over budget by", value: Math.abs(totalBudget - totalActual) },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="font-heading text-2xl font-bold">{formatMoney(card.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Add an expense category in Accounting first (for example Rent, Utilities or Outreach); each one gets a budget line here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {parsed.map((row) => {
            const state = budgetState(row);
            const left = row.budget - row.actual;
            return (
              <Card key={row.categoryId}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-heading font-semibold">{row.name}</p>
                    <div className="flex items-center gap-2">
                      <label htmlFor={`b-${row.categoryId}`} className="text-xs text-muted-foreground">
                        Budget
                      </label>
                      <Input
                        id={`b-${row.categoryId}`}
                        inputMode="decimal"
                        value={amounts[row.categoryId] ?? ""}
                        disabled={!canWrite}
                        placeholder="0"
                        onChange={(e) => setAmounts((a) => ({ ...a, [row.categoryId]: e.target.value }))}
                        className="h-8 w-32 text-right"
                      />
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={budgetPercent(row)} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.name} spent`}>
                    <div className={`h-full ${BAR_COLOR[state]}`} style={{ width: `${budgetPercent(row)}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Spent {formatMoney(row.actual)}
                    {row.budget > 0 && (left >= 0 ? ` · ${formatMoney(left)} left` : ` · over by ${formatMoney(-left)}`)}
                    {state === "over" && row.budget === 0 && " · not budgeted"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          {uncategorised > 0 && (
            <p className="text-sm text-muted-foreground">Another {formatMoney(uncategorised)} was spent this month with no category, so it isn&apos;t in any line above.</p>
          )}
        </div>
      )}
    </div>
  );
}
