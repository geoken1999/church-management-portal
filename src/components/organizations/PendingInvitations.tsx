"use client";

import { useActionState } from "react";
import { acceptInvitation, type AcceptInvitationState } from "@/lib/organizations/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: AcceptInvitationState = {};

interface Invitation {
  id: string;
  token: string;
  organizations: { name: string; slug: string } | null;
}

function AcceptInvitationRow({ invitation }: { invitation: Invitation }) {
  const [state, formAction, pending] = useActionState(acceptInvitation, initialState);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
      <div>
        <p className="text-sm font-medium">{invitation.organizations?.name ?? "An organization"}</p>
        {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      </div>
      <form action={formAction}>
        <input type="hidden" name="token" value={invitation.token} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Joining..." : "Accept"}
        </Button>
      </form>
    </div>
  );
}

export function PendingInvitations({ invitations }: { invitations: Invitation[] }) {
  if (invitations.length === 0) return null;

  return (
    <div className="space-y-3">
      <Alert>
        <AlertDescription>
          You&apos;ve been invited to join {invitations.length === 1 ? "an organization" : "these organizations"}.
        </AlertDescription>
      </Alert>
      {invitations.map((invitation) => (
        <AcceptInvitationRow key={invitation.id} invitation={invitation} />
      ))}
    </div>
  );
}
