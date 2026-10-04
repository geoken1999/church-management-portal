"use client";

import { useActionState } from "react";
import { savePayoutDetails, type SavePayoutDetailsState } from "@/lib/organizations/payout-details-actions";
import { PayoutDetailsFields, type PayoutDetailsDefaultValues } from "@/components/organizations/PayoutDetailsFields";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initialState: SavePayoutDetailsState = {};

// Standalone settings panel for the same org-level profile the Fund
// Raiser and Event "Request payout" dialogs read/write inline — lets an
// owner/admin update it anytime, not just while an active request is
// being made.
export function PayoutDetailsCard({
  organizationId,
  defaultValues,
}: {
  organizationId: string;
  defaultValues: PayoutDetailsDefaultValues | null;
}) {
  const [state, formAction, pending] = useActionState(savePayoutDetails, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payout details</CardTitle>
        <CardDescription>
          Where KingdomFlow should wire money collected through your Fund Raiser and Event registration payment
          gateways. Used whenever you request a payout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.success && (
            <Alert>
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          )}
          <PayoutDetailsFields defaultValues={defaultValues ?? undefined} errors={state.fieldErrors} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save payout details"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
