"use client";

import { useState, useTransition } from "react";
import { IndianRupee } from "lucide-react";
import { requestEventPayout, cancelEventPayoutRequest, type EventPayoutRequestState } from "@/lib/events/registration-actions";
import { SHARED_SERVICE_FEE_RATE, sharedServiceFee } from "@/lib/finance/fees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SHARED_SERVICE_FEE_PERCENT = `${SHARED_SERVICE_FEE_RATE * 100}%`;

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PayoutHistoryEntry {
  amount: number;
  note: string | null;
  createdAt: string;
}

const initialState: EventPayoutRequestState = {};

// Collapsed by default — most events will have zero or one payout on
// record. Mirrors PayoutHistoryList in FundraisersManager.tsx exactly.
function PayoutHistoryList({ payouts }: { payouts: PayoutHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  if (payouts.length === 0) return null;

  return (
    <div className="border-t border-border pt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-primary hover:underline">
        {open ? "Hide" : "Show"} payout history ({payouts.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {payouts.map((payout, index) => (
            <div key={index} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="text-muted-foreground">{new Date(payout.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
                {payout.note && <p className="truncate text-muted-foreground italic">{payout.note}</p>}
              </div>
              <span className="shrink-0 font-medium">{formatCurrency(payout.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EventPayoutDialog({
  eventId,
  eventTitle,
  collected,
  owed,
  pendingPayoutRequest,
  payoutHistory,
}: {
  eventId: string;
  eventTitle: string;
  collected: number;
  owed: number;
  pendingPayoutRequest: { id: string; amount: number } | null;
  payoutHistory: PayoutHistoryEntry[];
}) {
  const [state, setState] = useState<EventPayoutRequestState>(initialState);
  const [pending, startTransition] = useTransition();

  function handleRequest() {
    setState(initialState);
    const formData = new FormData();
    formData.set("eventId", eventId);
    startTransition(async () => {
      const result = await requestEventPayout(state, formData);
      setState(result);
    });
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <IndianRupee className="size-3.5 text-primary" />
            {formatCurrency(collected)} collected
            {pendingPayoutRequest && <Badge variant="secondary">Requested</Badge>}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payout — {eventTitle}</DialogTitle>
          <DialogDescription>
            Money collected through KingdomFlow&apos;s payment gateway for this event, waiting to be wired to you — a{" "}
            {SHARED_SERVICE_FEE_PERCENT} transaction fee is deducted before payout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">
              {formatCurrency(collected)} collected · {SHARED_SERVICE_FEE_PERCENT} fee ({formatCurrency(sharedServiceFee(collected))}) ·{" "}
              {formatCurrency(owed)} owed to you
            </p>
            <div>
              {pendingPayoutRequest ? (
                <form action={cancelEventPayoutRequest} className="flex items-center gap-2">
                  <input type="hidden" name="requestId" value={pendingPayoutRequest.id} />
                  <Badge variant="secondary">Requested — {formatCurrency(pendingPayoutRequest.amount)}</Badge>
                  <Button type="submit" size="sm" variant="ghost">
                    Cancel
                  </Button>
                </form>
              ) : owed > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={handleRequest} disabled={pending}>
                  {pending ? "Requesting..." : "Request payout"}
                </Button>
              ) : (
                <Badge variant="secondary">Fully paid out</Badge>
              )}
            </div>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <PayoutHistoryList payouts={payoutHistory} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
