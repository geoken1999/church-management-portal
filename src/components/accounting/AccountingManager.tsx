"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Calculator,
  MapPin,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Scale,
  Tag,
  Printer,
} from "lucide-react";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  createAccountingCategory,
  deleteAccountingCategory,
  type ExpenseFormState,
  type AccountingCategoryState,
} from "@/lib/accounting/actions";
import { EXPENSE_PAYMENT_METHODS, EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/accounting/validation";
import { ACCOUNTING_PERIOD_PRESETS, ACCOUNTING_PERIOD_LABELS, type AccountingPeriodPreset } from "@/lib/accounting/period";
import type { AccountingSummary } from "@/lib/accounting/dal";
import { IncomeExpenseChart } from "@/components/accounting/IncomeExpenseChart";
import type { AccountingCategory, Branch, Expense } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type BranchBasic = Pick<Branch, "id" | "name">;
type CategoryBasic = Pick<AccountingCategory, "id" | "name" | "type">;
type ExpenseRow = Expense & { branches: BranchBasic | null; accounting_categories: Pick<AccountingCategory, "id" | "name"> | null };

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Filters — period preset, branch, and (for "custom") an explicit date
// range, all driven through the URL so the server page re-fetches with
// the right filters on every change rather than this component owning
// server data itself.
// ---------------------------------------------------------------------------

function AccountingFilters({
  branches,
  preset,
  rangeStart,
  rangeEnd,
  selectedBranchId,
}: {
  branches: BranchBasic[];
  preset: AccountingPeriodPreset;
  rangeStart: string;
  rangeEnd: string;
  selectedBranchId: string;
}) {
  const router = useRouter();

  function navigate(next: { period?: string; branchId?: string; start?: string; end?: string }) {
    const params = new URLSearchParams();
    params.set("period", next.period ?? preset);
    if (next.branchId ?? selectedBranchId) params.set("branchId", next.branchId ?? selectedBranchId);
    if ((next.period ?? preset) === "custom") {
      params.set("start", next.start ?? rangeStart);
      params.set("end", next.end ?? rangeEnd);
    }
    router.push(`/dashboard/accounting?${params.toString()}`);
  }

  const ledgerParams = new URLSearchParams();
  ledgerParams.set("period", preset);
  if (selectedBranchId) ledgerParams.set("branchId", selectedBranchId);
  if (preset === "custom") {
    ledgerParams.set("start", rangeStart);
    ledgerParams.set("end", rangeEnd);
  }
  const ledgerHref = `/dashboard/accounting/ledger?${ledgerParams.toString()}`;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Period</Label>
        <Select value={preset} onValueChange={(value) => navigate({ period: value ?? "month" })}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue>{(value: string | null) => ACCOUNTING_PERIOD_LABELS[(value ?? "month") as AccountingPeriodPreset]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACCOUNTING_PERIOD_PRESETS.map((value) => (
              <SelectItem key={value} value={value}>
                {ACCOUNTING_PERIOD_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="rangeStart" className="text-xs">
              From
            </Label>
            <Input id="rangeStart" type="date" className="h-8 w-36" defaultValue={rangeStart} onChange={(event) => navigate({ start: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rangeEnd" className="text-xs">
              To
            </Label>
            <Input id="rangeEnd" type="date" className="h-8 w-36" defaultValue={rangeEnd} onChange={(event) => navigate({ end: event.target.value })} />
          </div>
        </>
      )}

      {branches.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Branch</Label>
          <Select value={selectedBranchId || "all"} onValueChange={(value) => navigate({ branchId: value === "all" ? "" : (value ?? "") })}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue>
                {(value: string | null) => (!value || value === "all" ? "All branches" : (branches.find((b) => b.id === value)?.name ?? "All branches"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="button" size="sm" variant="outline" className="ml-auto" nativeButton={false} render={<Link href={ledgerHref} />}>
        <Printer className="size-3.5" />
        Print ledger
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards({ summary }: { summary: AccountingSummary }) {
  const cards = [
    { label: "Income", value: summary.totalIncome, icon: TrendingUp, tone: "text-[#2a78d6] dark:text-[#3987e5]" },
    { label: "Expenses", value: summary.totalExpense, icon: TrendingDown, tone: "text-[#e34948] dark:text-[#e66767]" },
    { label: "Net", value: summary.net, icon: Scale, tone: summary.net >= 0 ? "text-primary" : "text-[#e34948] dark:text-[#e66767]" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <card.icon className={`size-4 ${card.tone}`} />
            </div>
            <p className={`font-heading text-2xl font-bold ${card.tone}`}>{formatMoney(card.value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------

function CategoryBreakdownList({ title, rows }: { title: string; rows: { category: string; amount: number }[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">Nothing recorded in this period.</p>
      </div>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.category} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{row.category}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatMoney(row.amount)} · {total > 0 ? Math.round((row.amount / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category management
// ---------------------------------------------------------------------------

const categoryInitialState: AccountingCategoryState = {};

function AccountingCategoryManager({ organizationId, categories }: { organizationId: string; categories: CategoryBasic[] }) {
  const [state, setState] = useState<AccountingCategoryState>(categoryInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createAccountingCategory(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((category) => (
          <Badge key={category.id} variant="secondary" className="gap-1.5">
            <Tag className="size-3" />
            {category.name}
            <span className="text-muted-foreground">{category.type === "income" ? "income" : "expense"}</span>
            <form action={deleteAccountingCategory} className="inline">
              <input type="hidden" name="categoryId" value={category.id} />
              <button type="submit" className="ml-0.5 text-muted-foreground hover:text-destructive" aria-label={`Delete ${category.name}`}>
                ×
              </button>
            </form>
          </Badge>
        ))}
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setState(categoryInitialState);
          }}
        >
          <DialogTrigger render={<Button type="button" size="sm" variant="outline"><Plus className="size-3.5" />Category</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New accounting category</DialogTitle>
              <DialogDescription>Used to organize expenses (and offerings you tag with the same name) in reports.</DialogDescription>
            </DialogHeader>
            <form action={handleSubmit} className="space-y-4">
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="type" value={type} />
              {state.error && (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="categoryName">Name</Label>
                <Input id="categoryName" name="name" placeholder="Utilities, Salaries, Missions..." required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoryType">Type</Label>
                <Select value={type} onValueChange={(value) => setType((value ?? "expense") as "income" | "expense")}>
                  <SelectTrigger id="categoryType" className="w-full">
                    <SelectValue>{(value: string | null) => (value === "income" ? "Income" : "Expense")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const expenseInitialState: ExpenseFormState = {};

type FieldErrorsProp = ExpenseFormState["fieldErrors"];

function ExpenseFields({
  expense,
  branches,
  categories,
  branchId,
  onBranchChange,
  categoryId,
  onCategoryChange,
  paymentMethod,
  onPaymentMethodChange,
  errors,
}: {
  expense?: Expense;
  branches: BranchBasic[];
  categories: CategoryBasic[];
  branchId: string;
  onBranchChange: (value: string) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
  errors?: FieldErrorsProp;
}) {
  const expenseCategories = categories.filter((category) => category.type === "expense");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" min="0" step="0.01" defaultValue={expense?.amount ?? ""} aria-invalid={Boolean(errors?.amount)} />
          <FieldError id="amount-error" message={errors?.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expenseDate">Date</Label>
          <Input id="expenseDate" name="expenseDate" type="date" defaultValue={expense?.expense_date ?? ""} aria-invalid={Boolean(errors?.expenseDate)} />
          <FieldError id="expenseDate-error" message={errors?.expenseDate} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="payee">Paid to (optional)</Label>
        <Input id="payee" name="payee" defaultValue={expense?.payee ?? ""} placeholder="Vendor, staff member, supplier..." />
      </div>
      {expenseCategories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category (optional)</Label>
          <Select value={categoryId} onValueChange={(v) => onCategoryChange(v ?? "")}>
            <SelectTrigger id="categoryId" className="w-full">
              <SelectValue placeholder="Uncategorized">
                {(v: string | null) => expenseCategories.find((c) => c.id === v)?.name ?? "Uncategorized"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Uncategorized</SelectItem>
              {expenseCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {branches.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="branchId">Branch (optional)</Label>
          <Select value={branchId} onValueChange={(v) => onBranchChange(v ?? "")}>
            <SelectTrigger id="branchId" className="w-full">
              <SelectValue placeholder="No branch">{(v: string | null) => branches.find((b) => b.id === v)?.name ?? "No branch"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No branch</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="paymentMethod">Payment method</Label>
        <Select value={paymentMethod} onValueChange={(v) => onPaymentMethodChange(v ?? "cash")}>
          <SelectTrigger id="paymentMethod" className="w-full">
            <SelectValue>
              {(v: string | null) => EXPENSE_PAYMENT_METHOD_LABELS[(v ?? "cash") as (typeof EXPENSE_PAYMENT_METHODS)[number]]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_PAYMENT_METHODS.map((value) => (
              <SelectItem key={value} value={value}>
                {EXPENSE_PAYMENT_METHOD_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={expense?.notes ?? ""} rows={2} />
      </div>
    </div>
  );
}

function AddExpenseDialog({ organizationId, branches, categories }: { organizationId: string; branches: BranchBasic[]; categories: CategoryBasic[] }) {
  const [state, setState] = useState<ExpenseFormState>(expenseInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  function reset() {
    setState(expenseInitialState);
    setBranchId("");
    setCategoryId("");
    setPaymentMethod("cash");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createExpense(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button"><Plus className="size-4" />Record expense</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
          <DialogDescription>Log money spent — bills, salaries, supplies, anything going out.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <ExpenseFields
            branches={branches}
            categories={categories}
            branchId={branchId}
            onBranchChange={setBranchId}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseDialog({ expense, branches, categories }: { expense: Expense; branches: BranchBasic[]; categories: CategoryBasic[] }) {
  const [state, setState] = useState<ExpenseFormState>(expenseInitialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(expense.branch_id ?? "");
  const [categoryId, setCategoryId] = useState(expense.category_id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<string>(expense.payment_method);

  function reset() {
    setState(expenseInitialState);
    setBranchId(expense.branch_id ?? "");
    setCategoryId(expense.category_id ?? "");
    setPaymentMethod(expense.payment_method);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateExpense(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm"><Pencil className="size-3.5" />Edit</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>Update this record.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={expense.id} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <ExpenseFields
            expense={expense}
            branches={branches}
            categories={categories}
            branchId={branchId}
            onBranchChange={setBranchId}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseCard({ expense, branches, categories, canWrite, canDelete }: { expense: ExpenseRow; branches: BranchBasic[]; categories: CategoryBasic[]; canWrite: boolean; canDelete: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <h3 className="font-heading text-base font-bold text-[#e34948] dark:text-[#e66767]">{formatMoney(expense.amount)}</h3>
            <span className="text-sm text-muted-foreground">{expense.accounting_categories?.name ?? "Uncategorized"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDate(expense.expense_date)}
            </span>
            {expense.payee && <span>Paid to {expense.payee}</span>}
            {expense.branches && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {expense.branches.name}
              </span>
            )}
            <Badge variant="secondary">{EXPENSE_PAYMENT_METHOD_LABELS[expense.payment_method]}</Badge>
          </div>
          {expense.notes && <p className="text-sm text-muted-foreground">{expense.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canWrite && <EditExpenseDialog expense={expense} branches={branches} categories={categories} />}
          {canDelete && (
            <form action={deleteExpense}>
              <input type="hidden" name="id" value={expense.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function AccountingManager({
  organizationId,
  summary,
  expenses,
  categories,
  branches,
  preset,
  rangeStart,
  rangeEnd,
  selectedBranchId,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  summary: AccountingSummary;
  expenses: ExpenseRow[];
  categories: CategoryBasic[];
  branches: BranchBasic[];
  preset: AccountingPeriodPreset;
  rangeStart: string;
  rangeEnd: string;
  selectedBranchId: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-6">
      <AccountingFilters branches={branches} preset={preset} rangeStart={rangeStart} rangeEnd={rangeEnd} selectedBranchId={selectedBranchId} />

      <SummaryCards summary={summary} />

      <Card>
        <CardContent className="space-y-4">
          <IncomeExpenseChart series={summary.series} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <CategoryBreakdownList title="Income by category" rows={summary.incomeByCategory} />
          <CategoryBreakdownList title="Expenses by category" rows={summary.expenseByCategory} />
        </CardContent>
      </Card>

      {canWrite && <AccountingCategoryManager organizationId={organizationId} categories={categories} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {expenses.length} {expenses.length === 1 ? "expense" : "expenses"} recorded
        </p>
        {canWrite && <AddExpenseDialog organizationId={organizationId} branches={branches} categories={categories} />}
      </div>

      {expenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Calculator className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No expenses recorded yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Record expense" to log your first one.' : "Check back once a record is logged."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {expenses.map((expense) => (
            <ExpenseCard key={expense.id} expense={expense} branches={branches} categories={categories} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
