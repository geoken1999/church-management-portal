"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, CheckCircle2 } from "lucide-react";
import { updatePayrollEntry, removePayrollEntry, markPayrollPaid, deletePayrollRun } from "@/lib/accounting/payroll-actions";
import { validateEntry } from "@/lib/accounting/payroll";
import { EXPENSE_PAYMENT_METHODS, EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/accounting/validation";
import type { PayrollEntry, PayrollRun } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorToast } from "@/components/ui/error-toast";
import { PrintButton } from "@/components/accounting/PrintButton";

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Draft = { basic: string; allowances: string; deductions: string };

export function PayrollRunManager({
  run,
  entries,
  today,
  canWrite,
  canDelete,
}: {
  run: PayrollRun;
  entries: PayrollEntry[];
  today: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isDraft = run.status === "draft";
  const editable = isDraft && canWrite;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(entries.map((e) => [e.id, { basic: String(e.basic), allowances: String(e.allowances), deductions: String(e.deductions) }])),
  );
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("bank_transfer");

  const total = entries.reduce((sum, e) => sum + e.net, 0);

  function run_<T extends { error?: string; success?: boolean }>(action: () => Promise<T>, then?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setError(null);
        if (then) then();
        else router.refresh();
      }
    });
  }

  function saveRow(entry: PayrollEntry) {
    const draft = drafts[entry.id];
    const check = validateEntry(draft);
    const first = Object.values(check.errors).find(Boolean);
    if (first) return setError(first);
    run_(() => updatePayrollEntry(entry.id, draft));
  }

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Salary</th>
              <th className="px-4 py-3 text-right">Allowances</th>
              <th className="px-4 py-3 text-right">Deductions</th>
              <th className="px-4 py-3 text-right">Net pay</th>
              {editable && <th className="px-4 py-3 print:hidden" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => {
              const draft = drafts[entry.id];
              const live = validateEntry(draft);
              const changed = draft.basic !== String(entry.basic) || draft.allowances !== String(entry.allowances) || draft.deductions !== String(entry.deductions);
              const set = (patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [entry.id]: { ...d[entry.id], ...patch } }));
              return (
                <tr key={entry.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.employee_name}</p>
                    {entry.job_title && <p className="text-xs text-muted-foreground">{entry.job_title}</p>}
                  </td>
                  {editable ? (
                    <>
                      {(["basic", "allowances", "deductions"] as const).map((field) => (
                        <td key={field} className="px-2 py-2 text-right">
                          <Input
                            aria-label={`${field} for ${entry.employee_name}`}
                            inputMode="decimal"
                            value={draft[field]}
                            onChange={(e) => set({ [field]: e.target.value })}
                            className="ml-auto h-8 w-28 text-right"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(changed ? live.net : entry.net)}</td>
                      <td className="px-2 py-2 print:hidden">
                        <div className="flex items-center justify-end gap-1">
                          {changed && (
                            <Button type="button" size="sm" onClick={() => saveRow(entry)} disabled={pending}>
                              Save
                            </Button>
                          )}
                          {canDelete && (
                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${entry.employee_name} from this payroll`} disabled={pending} onClick={() => run_(() => removePayrollEntry(entry.id))}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-right">{formatMoney(entry.basic)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(entry.allowances)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(entry.deductions)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(entry.net)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-heading font-bold">
              <td className="px-4 py-3" colSpan={4}>
                Total to pay
              </td>
              <td className="px-4 py-3 text-right">{formatMoney(total)}</td>
              {editable && <td className="print:hidden" />}
            </tr>
          </tfoot>
        </table>
      </div>

      {isDraft ? (
        canWrite && entries.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4 print:hidden">
            <div className="space-y-1">
              <Label htmlFor="paidOn" className="text-xs">Paid on</Label>
              <Input id="paidOn" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="method" className="text-xs">Paid by</Label>
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
                {EXPENSE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {EXPENSE_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Mark ${entries.length} salaries (${formatMoney(total)}) as paid? One expense per person is added to Accounting.`)) run_(() => markPayrollPaid(run.id, paidOn, method));
              }}
            >
              <CheckCircle2 className="size-4" />
              Mark as paid
            </Button>
            {canDelete && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Delete this draft payroll?")) run_(() => deletePayrollRun(run.id), () => router.push("/dashboard/accounting/payroll"));
                }}
              >
                Delete draft
              </Button>
            )}
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          Paid on {run.paid_on} {run.payment_method ? `by ${EXPENSE_PAYMENT_METHOD_LABELS[run.payment_method]}` : ""}. The salaries are in Accounting under the Salaries category.
        </p>
      )}

      <PrintButton label="Print payroll sheet" />
    </div>
  );
}
