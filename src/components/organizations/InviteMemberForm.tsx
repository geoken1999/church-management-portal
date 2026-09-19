"use client";

import { useActionState, useState } from "react";
import { inviteMember, type InviteMemberState } from "@/lib/organizations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: InviteMemberState = {};

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(inviteMember, initialState);
  const [copied, setCopied] = useState(false);

  const inviteLink =
    state.inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${state.inviteToken}`
      : null;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {inviteLink && (
        <Alert>
          <AlertDescription>
            <p className="mb-1.5">
              Invitation created. There&apos;s no email delivery set up yet, so share this link
              directly:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{inviteLink}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Input
          type="email"
          name="email"
          placeholder="teammate@example.com"
          required
          aria-label="Email to invite"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting..." : "Invite"}
        </Button>
      </div>
    </form>
  );
}
