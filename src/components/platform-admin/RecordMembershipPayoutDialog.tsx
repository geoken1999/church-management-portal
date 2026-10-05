"use client";

import { useActionState } from "react";
import { recordMembershipPayout, type RecordMembershipPayoutState } from "@/lib/platform-admin/membership-payout-actions";
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

const initialState: RecordMembershipPayoutState = {};

export function RecordMembershipPayoutDialog({
  organizationId,
  organizationName,
  owed,
}: {
  organizationId: string;
  organizationName: string;
  owed: number;
}) {
  const [state, formAction, pending] = useActionState(recordMembershipPayout, initialState);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline">Record payout</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a membership fee payout — {organizationName}</DialogTitle>
          <DialogDescription>
            Only log this after the money has actually been wired to the church. This doesn&apos;t move any funds itself. The church gets a
            receipt email once you save this.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.success && (
            <Alert>
              <AlertDescription>Payout recorded.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`membership-payout-amount-${organizationId}`}>Amount (₹)</Label>
            <Input
              id={`membership-payout-amount-${organizationId}`}
              name="amount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={owed > 0 ? owed.toFixed(2) : ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`membership-payout-note-${organizationId}`}>Note (optional)</Label>
            <Input id={`membership-payout-note-${organizationId}`} name="note" placeholder="e.g. bank transfer reference" />
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
