"use client";

import { useActionState } from "react";
import { recordPlatformExpense, type RecordExpenseState } from "@/lib/platform-admin/expense-actions";
import { PLATFORM_SERVICES } from "@/lib/platform-admin/finance-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: RecordExpenseState = {};

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function RecordExpenseDialog({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(recordPlatformExpense, initialState);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button">Record payment</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a service payment</DialogTitle>
          <DialogDescription>
            Log a bill you&apos;ve already paid for a service KingdomFlow runs on. This doesn&apos;t pay anyone; it keeps the expenses and
            margins accurate.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.success && (
            <Alert>
              <AlertDescription>Payment recorded.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="expense-service">Service</Label>
            <select id="expense-service" name="service" className={SELECT_CLASS} defaultValue="">
              <option value="" disabled>
                Choose a service
              </option>
              {PLATFORM_SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.service && <p className="text-sm text-destructive">{state.fieldErrors.service}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-description">What was paid for</Label>
            <Input id="expense-description" name="description" placeholder="e.g. Pro plan, May 2026" />
            {state.fieldErrors?.description && <p className="text-sm text-destructive">{state.fieldErrors.description}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">Amount (₹)</Label>
              <Input id="expense-amount" name="amount" type="number" min={0} step="0.01" inputMode="decimal" />
              {state.fieldErrors?.amount && <p className="text-sm text-destructive">{state.fieldErrors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-paid-on">Paid on</Label>
              <Input id="expense-paid-on" name="paidOn" type="date" defaultValue={today} />
              {state.fieldErrors?.paidOn && <p className="text-sm text-destructive">{state.fieldErrors.paidOn}</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-vendor">Vendor (optional)</Label>
              <Input id="expense-vendor" name="vendor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-reference">Invoice or reference (optional)</Label>
              <Input id="expense-reference" name="reference" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
