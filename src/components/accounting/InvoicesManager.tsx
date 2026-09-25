"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2, FileText, CalendarDays, MapPin } from "lucide-react";
import { createInvoice, updateInvoiceStatus, deleteInvoice, type InvoiceFormState } from "@/lib/accounting/actions";
import type { InvoiceLineItemInput } from "@/lib/accounting/validation";
import type { Branch, Invoice, InvoiceStatus } from "@/types/database";
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
type InvoiceRow = Invoice & { branches: BranchBasic | null };

const STATUS_VARIANTS: Record<InvoiceStatus, "default" | "secondary" | "destructive"> = {
  unpaid: "default",
  paid: "secondary",
  cancelled: "destructive",
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  cancelled: "Cancelled",
};

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyLineItem = (): InvoiceLineItemInput => ({ description: "", quantity: "1", unitPrice: "" });
const initialState: InvoiceFormState = {};

function CreateInvoiceDialog({ organizationId, branches }: { organizationId: string; branches: BranchBasic[] }) {
  const [state, setState] = useState<InvoiceFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [items, setItems] = useState<InvoiceLineItemInput[]>([emptyLineItem()]);

  function reset() {
    setState(initialState);
    setBranchId("");
    setTaxRate("0");
    setItems([emptyLineItem()]);
  }

  function updateItem(index: number, patch: Partial<InvoiceLineItemInput>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    setItems((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
  }

  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const taxAmount = subtotal * ((Number(taxRate) || 0) / 100);
  const total = subtotal + taxAmount;

  function handleSubmit(formData: FormData) {
    formData.set("items", JSON.stringify(items));
    startTransition(async () => {
      const result = await createInvoice(state, formData);
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
      <DialogTrigger render={<Button type="button"><Plus className="size-4" />Create invoice</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create an invoice</DialogTitle>
          <DialogDescription>Bill someone for hall rental, services, or anything else — printable once saved.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="taxRate" value={taxRate} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billToName">Bill to</Label>
              <Input id="billToName" name="billToName" placeholder="Name or organization" required aria-invalid={Boolean(state.fieldErrors?.billToName)} />
              <FieldError id="billToName-error" message={state.fieldErrors?.billToName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billToEmail">Email (optional)</Label>
              <Input id="billToEmail" name="billToEmail" type="email" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="billToAddress">Address (optional)</Label>
            <Textarea id="billToAddress" name="billToAddress" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="issueDate">Issue date</Label>
              <Input id="issueDate" name="issueDate" type="date" defaultValue={today()} required aria-invalid={Boolean(state.fieldErrors?.issueDate)} />
              <FieldError id="issueDate-error" message={state.fieldErrors?.issueDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date (optional)</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            {branches.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="branchId-select">Branch (optional)</Label>
                <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
                  <SelectTrigger id="branchId-select" className="w-full">
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" size="xs" variant="outline" onClick={() => setItems((current) => [...current, emptyLineItem()])}>
                <Plus className="size-3" />
                Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(event) => updateItem(index, { description: event.target.value })}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit price"
                    value={item.unitPrice}
                    onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                    className="w-28"
                  />
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeItem(index)} disabled={items.length === 1}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <FieldError id="items-error" message={state.fieldErrors?.items} />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="taxRateInput">Tax rate (%)</Label>
              <Input
                id="taxRateInput"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors?.taxRate)}
              />
              <FieldError id="taxRate-error" message={state.fieldErrors?.taxRate} />
            </div>
            <div className="col-span-2 flex flex-col justify-end space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatMoney(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes / terms (optional)</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Payment terms, thank-you note, etc." />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceCard({ invoice, canWrite, canDelete }: { invoice: InvoiceRow; canWrite: boolean; canDelete: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/accounting/invoices/${invoice.id}`} className="font-heading text-base font-bold hover:underline">
              {invoice.invoice_number}
            </Link>
            <Badge variant={STATUS_VARIANTS[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
          </div>
          <p className="text-sm">{invoice.bill_to_name}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDate(invoice.issue_date)}
            </span>
            {invoice.branches && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {invoice.branches.name}
              </span>
            )}
            <span className="font-medium text-foreground">{formatMoney(invoice.total)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="ghost" nativeButton={false} render={<Link href={`/dashboard/accounting/invoices/${invoice.id}`} />}>
            <FileText className="size-3.5" />
            View
          </Button>
          {canWrite && invoice.status !== "cancelled" && (
            <form action={updateInvoiceStatus}>
              <input type="hidden" name="id" value={invoice.id} />
              <input type="hidden" name="status" value={invoice.status === "paid" ? "unpaid" : "paid"} />
              <Button type="submit" size="sm" variant="outline">
                {invoice.status === "paid" ? "Mark unpaid" : "Mark paid"}
              </Button>
            </form>
          )}
          {canDelete && (
            <form action={deleteInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function InvoicesManager({
  organizationId,
  invoices,
  branches,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  invoices: InvoiceRow[];
  branches: BranchBasic[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">Invoices</h2>
        {canWrite && <CreateInvoiceDialog organizationId={organizationId} branches={branches} />}
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No invoices yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Create invoice" to bill someone.' : "Check back once one is created."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <InvoiceCard key={invoice.id} invoice={invoice} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
