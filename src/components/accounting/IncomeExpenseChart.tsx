"use client";

import { useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountingBucketTotal } from "@/lib/accounting/dal";

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Diverging pair (blue <-> red) from the app's validated dataviz palette —
// income and expense read as opposite poles of cash flow, which is exactly
// what a diverging pair is for. Categorical/status colors are reserved for
// other jobs, so this doesn't reuse either.
const INCOME_COLOR = "bg-[#2a78d6] dark:bg-[#3987e5]";
const EXPENSE_COLOR = "bg-[#e34948] dark:bg-[#e66767]";

export function IncomeExpenseChart({ series }: { series: AccountingBucketTotal[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const max = Math.max(1, ...series.map((bucket) => Math.max(bucket.income, bucket.expense)));
  const hasData = series.some((bucket) => bucket.income > 0 || bucket.expense > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${INCOME_COLOR}`} />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${EXPENSE_COLOR}`} />
            Expense
          </span>
        </div>
        <Button type="button" size="xs" variant="ghost" onClick={() => setView(view === "chart" ? "table" : "chart")}>
          {view === "chart" ? (
            <>
              <Table2 className="size-3.5" />
              View as table
            </>
          ) : (
            <>
              <BarChart3 className="size-3.5" />
              View as chart
            </>
          )}
        </Button>
      </div>

      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No income or expenses in this period.</p>
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">Income</th>
                <th className="px-3 py-2 text-right font-medium">Expense</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {series.map((bucket) => (
                <tr key={bucket.key} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{bucket.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(bucket.income)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(bucket.expense)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(bucket.income - bucket.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-end gap-3 overflow-x-auto pb-1" role="img" aria-label="Income and expense by period, see table view for exact values">
          {series.map((bucket) => (
            <div key={bucket.key} className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: 44 }}>
              <div className="flex h-32 items-end gap-1">
                <div className="flex w-4 flex-col items-center justify-end gap-1">
                  {bucket.income > 0 && <span className="text-[10px] text-muted-foreground">{formatMoney(bucket.income)}</span>}
                  <div
                    className={`w-full rounded-t-[4px] ${INCOME_COLOR}`}
                    style={{ height: `${Math.max(2, (bucket.income / max) * 100)}%` }}
                  />
                </div>
                <div className="flex w-4 flex-col items-center justify-end gap-1">
                  {bucket.expense > 0 && <span className="text-[10px] text-muted-foreground">{formatMoney(bucket.expense)}</span>}
                  <div
                    className={`w-full rounded-t-[4px] ${EXPENSE_COLOR}`}
                    style={{ height: `${Math.max(2, (bucket.expense / max) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">{bucket.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
