"use client";

import { useActionState } from "react";
import { requestMembershipPayout, type RequestMembershipPayoutState } from "@/lib/membership-fees/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: RequestMembershipPayoutState = {};

export function RequestMembershipPayoutButton({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(requestMembershipPayout, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>Payout requested. The platform team will send it to your saved account.</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Requesting…" : "Request payout"}
      </Button>
    </form>
  );
}
