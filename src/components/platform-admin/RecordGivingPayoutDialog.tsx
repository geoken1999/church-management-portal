"use client";

import { useActionState } from "react";
import {
  recordGivingPayout,
  type RecordGivingPayoutState,
} from "@/lib/platform-admin/giving-payout-actions";
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
import { ErrorToast } from "@/components/ui/error-toast";

const initialState: RecordGivingPayoutState = {};

export function RecordGivingPayoutDialog({
  organizationId,
  organizationName,
  owed,
}: {
  organizationId: string;
  organizationName: string;
  owed: number;
}) {
  const [state, formAction, pending] = useActionState(
    recordGivingPayout,
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            Record payout
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Record an online giving payout — {organizationName}
          </DialogTitle>
          <DialogDescription>
            Only log this after the money has actually been wired to the church.
            This doesn&apos;t move any funds itself. The church gets a receipt
            email once you save this.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <ErrorToast message={state.error} />
          {state.success && (
            <Alert>
              <AlertDescription>Payout recorded.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`giving-payout-amount-${organizationId}`}>
              Amount (₹)
            </Label>
            <Input
              id={`giving-payout-amount-${organizationId}`}
              name="amount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={owed > 0 ? owed.toFixed(2) : ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`giving-payout-note-${organizationId}`}>
              Note (optional)
            </Label>
            <Input
              id={`giving-payout-note-${organizationId}`}
              name="note"
              placeholder="e.g. bank transfer reference"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save payout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
