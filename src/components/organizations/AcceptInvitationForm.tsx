"use client";

import { useActionState } from "react";
import { acceptInvitation, type AcceptInvitationState } from "@/lib/organizations/actions";
import { Button } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";

const initialState: AcceptInvitationState = {};

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitation, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <ErrorToast message={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Joining..." : "Accept invitation"}
      </Button>
    </form>
  );
}
