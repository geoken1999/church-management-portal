"use client";

import { useActionState } from "react";
import { recordPlatformInvestment, type RecordInvestmentState } from "@/lib/platform-admin/expense-actions";
import { INVESTMENT_CATEGORIES } from "@/lib/platform-admin/finance-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ErrorToast } from "@/components/ui/error-toast";

const initialState: RecordInvestmentState = {};

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function RecordInvestmentDialog({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(recordPlatformInvestment, initialState);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline">Record investment</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an investment</DialogTitle>
          <DialogDescription>
            Log money that was put into KingdomFlow: the owner&apos;s capital, an investor, a loan. This doesn&apos;t move any money; it keeps the books accurate.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <ErrorToast message={state.error} />
          {state.success && (
            <Alert>
              <AlertDescription>Investment recorded.</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="investment-investor">Invested by</Label>
              <Input id="investment-investor" name="investor" placeholder="e.g. George Kennedy" />
              {state.fieldErrors?.investor && <p className="text-sm text-destructive">{state.fieldErrors.investor}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="investment-category">Kind</Label>
              <select id="investment-category" name="category" className={SELECT_CLASS} defaultValue="capital">
                {INVESTMENT_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.category && <p className="text-sm text-destructive">{state.fieldErrors.category}</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="investment-amount">Amount (₹)</Label>
              <Input id="investment-amount" name="amount" type="number" min={0} step="0.01" inputMode="decimal" />
              {state.fieldErrors?.amount && <p className="text-sm text-destructive">{state.fieldErrors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="investment-date">Invested on</Label>
              <Input id="investment-date" name="investedOn" type="date" defaultValue={today} />
              {state.fieldErrors?.investedOn && <p className="text-sm text-destructive">{state.fieldErrors.investedOn}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="investment-purpose">What it is for (optional)</Label>
            <Input id="investment-purpose" name="purpose" placeholder="e.g. Hosting, development, marketing" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="investment-reference">Reference (optional)</Label>
            <Input id="investment-reference" name="reference" placeholder="Transfer id or agreement" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save investment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
