"use client";

import { useActionState } from "react";
import { recordFundraiserPayout, type RecordPayoutState } from "@/lib/platform-admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const initialState: RecordPayoutState = {};

export function RecordPayoutDialog({
  fundraiserId,
  organizationId,
  fundraiserTitle,
  owed,
}: {
  fundraiserId: string;
  organizationId: string;
  fundraiserTitle: string;
  owed: number;
}) {
  const [state, formAction, pending] = useActionState(recordFundraiserPayout, initialState);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline">Record payout</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payout — {fundraiserTitle}</DialogTitle>
          <DialogDescription>
            Only log this after the money has actually been wired to the church. This doesn&apos;t move any funds itself.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="fundraiserId" value={fundraiserId} />
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input id="amount" name="amount" type="number" min={0.01} step="0.01" defaultValue={owed > 0 ? owed : undefined} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea id="note" name="note" rows={2} placeholder="e.g. Bank transfer ref #12345" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Record payout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
