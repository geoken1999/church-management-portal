"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, ChevronRight } from "lucide-react";
import { saveEmployee, deleteEmployee, createPayrollRun, type EmployeeForm } from "@/lib/accounting/payroll-actions";
import { monthLabel } from "@/lib/accounting/payroll";
import type { PayrollRunSummary } from "@/lib/accounting/payroll-dal";
import type { PayrollEmployee } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const blankForm = (organizationId: string): EmployeeForm => ({
  organizationId,
  name: "",
  jobTitle: "",
  branchId: "",
  monthlySalary: "",
  defaultAllowances: "",
  defaultDeductions: "",
  joinedOn: "",
  active: true,
  notes: "",
});

export function PayrollManager({
  organizationId,
  employees,
  runs,
  branches,
  currentMonth,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  employees: PayrollEmployee[];
  runs: PayrollRunSummary[];
  branches: { id: string; name: string }[];
  currentMonth: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [month, setMonth] = useState(currentMonth);

  const active = employees.filter((e) => e.active);
  const monthlyTotal = active.reduce((sum, e) => sum + e.monthly_salary + e.default_allowances - e.default_deductions, 0);

  function edit(e: PayrollEmployee) {
    setFieldErrors({});
    setForm({
      organizationId,
      id: e.id,
      name: e.name,
      jobTitle: e.job_title ?? "",
      branchId: e.branch_id ?? "",
      monthlySalary: String(e.monthly_salary),
      defaultAllowances: e.default_allowances ? String(e.default_allowances) : "",
      defaultDeductions: e.default_deductions ? String(e.default_deductions) : "",
      joinedOn: e.joined_on ?? "",
      active: e.active,
      notes: e.notes ?? "",
    });
  }

  function submit() {
    if (!form) return;
    startTransition(async () => {
      const result = await saveEmployee(form);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      if (result.error) setError(result.error);
      if (result.success) {
        setForm(null);
        router.refresh();
      }
    });
  }

  function remove(e: PayrollEmployee) {
    if (!window.confirm(`Remove ${e.name}? Past payslips keep their name.`)) return;
    startTransition(async () => {
      const result = await deleteEmployee(organizationId, e.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function startRun() {
    startTransition(async () => {
      const result = await createPayrollRun(organizationId, month);
      if (result.error) setError(result.error);
      else if (result.runId) router.push(`/dashboard/accounting/payroll/${result.runId}`);
    });
  }

  const set = (patch: Partial<EmployeeForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="space-y-10">
      <ErrorToast message={error} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-bold">Payroll runs</h2>
            <p className="text-sm text-muted-foreground">
              {active.length} active {active.length === 1 ? "person" : "people"} · about {formatMoney(monthlyTotal)} a month
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="payMonth" className="text-xs">Month</Label>
                <Input id="payMonth" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
              </div>
              <Button type="button" onClick={startRun} disabled={pending || !month}>
                <Plus className="size-4" />
                Run payroll
              </Button>
            </div>
          )}
        </div>

        {runs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No payroll yet. Add your people below, then run payroll for a month.</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <Link key={run.id} href={`/dashboard/accounting/payroll/${run.id}`}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-heading font-semibold">{monthLabel(run.pay_month)}</p>
                      <p className="text-sm text-muted-foreground">
                        {run.people} {run.people === 1 ? "person" : "people"} · {formatMoney(run.total)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={run.status === "paid" ? "default" : "secondary"}>{run.status === "paid" ? "Paid" : "Draft"}</Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold">
              <Users className="size-5" />
              People on payroll
            </h2>
            <p className="text-sm text-muted-foreground">Pastors, staff and anyone you pay a regular salary.</p>
          </div>
          {canWrite && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFieldErrors({});
                setForm(blankForm(organizationId));
              }}
            >
              <Plus className="size-4" />
              Add person
            </Button>
          )}
        </div>

        {employees.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">Nobody added yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {employees.map((e) => (
              <Card key={e.id} className={e.active ? "" : "opacity-60"}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-heading font-semibold">
                      {e.name} {!e.active && <Badge variant="secondary">Inactive</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[e.job_title, branches.find((b) => b.id === e.branch_id)?.name].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-heading font-semibold">{formatMoney(e.monthly_salary)}</p>
                      <p className="text-xs text-muted-foreground">per month</p>
                    </div>
                    {canWrite && (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${e.name}`} onClick={() => edit(e)}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${e.name}`} onClick={() => remove(e)} disabled={pending}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit person" : "Add a person"}</DialogTitle>
            <DialogDescription>Allowances and deductions set here are used for every payroll run, and can be changed per month.</DialogDescription>
          </DialogHeader>
          {form && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emp-name">Name</Label>
                  <Input id="emp-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
                  <FieldError id="emp-name-error" message={fieldErrors.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-title">Role (optional)</Label>
                  <Input id="emp-title" value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="Pastor, Secretary…" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="emp-salary">Monthly salary</Label>
                  <Input id="emp-salary" inputMode="decimal" value={form.monthlySalary} onChange={(e) => set({ monthlySalary: e.target.value })} required />
                  <FieldError id="emp-salary-error" message={fieldErrors.monthlySalary} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-allow">Allowances</Label>
                  <Input id="emp-allow" inputMode="decimal" value={form.defaultAllowances} onChange={(e) => set({ defaultAllowances: e.target.value })} />
                  <FieldError id="emp-allow-error" message={fieldErrors.defaultAllowances} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-deduct">Deductions</Label>
                  <Input id="emp-deduct" inputMode="decimal" value={form.defaultDeductions} onChange={(e) => set({ defaultDeductions: e.target.value })} />
                  <FieldError id="emp-deduct-error" message={fieldErrors.defaultDeductions} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emp-branch">Branch (optional)</Label>
                  <select
                    id="emp-branch"
                    value={form.branchId}
                    onChange={(e) => set({ branchId: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">No branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-joined">Joined (optional)</Label>
                  <Input id="emp-joined" type="date" value={form.joinedOn} onChange={(e) => set({ joinedOn: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-notes">Notes (optional)</Label>
                <Textarea id="emp-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
                Include in payroll runs
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
