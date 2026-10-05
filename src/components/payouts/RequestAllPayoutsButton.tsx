"use client";

import { useActionState } from "react";
import { requestAllPayouts, type RequestAllPayoutsState } from "@/lib/payouts/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: RequestAllPayoutsState = {};

export function RequestAllPayoutsButton({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(requestAllPayouts, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>
            {state.created} payout request{state.created === 1 ? "" : "s"} sent to the platform team.
            {state.skipped && state.skipped.length > 0 ? ` Not requested: ${state.skipped.join("; ")}.` : ""}
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Requesting…" : "Request payout for everything owed"}
      </Button>
    </form>
  );
}
