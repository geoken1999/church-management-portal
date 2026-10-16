"use client";

import { useState, useTransition } from "react";
import { processAccountDeletionAction } from "@/lib/account-deletion/actions";
import {
  allowedDecisions,
  describeDecision,
  type DeletionDecision,
  type DeletionRequesterKind,
} from "@/lib/account-deletion/rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

export interface DeletionRequestView {
  id: string;
  kind: DeletionRequesterKind;
  name: string;
  contact: string | null;
  reason: string | null;
  requestedAt: string;
  churchName?: string | null;
  status: "pending" | "completed" | "rejected";
  outcome: string | null;
  processedAt: string | null;
}

const KIND_LABELS: Record<DeletionRequesterKind, string> = {
  member: "Member",
  team: "Team member",
  owner: "Church owner",
};
const OUTCOME_LABELS: Record<string, string> = {
  account_deleted: "Account deleted",
  account_and_member_deleted: "Account and member record deleted",
  removed_from_church: "Removed from the church",
  declined: "Declined",
};
const BUTTON_LABELS: Record<DeletionDecision, string> = {
  delete_account: "Delete account",
  delete_account_and_record: "Delete account and member record",
  reject: "Decline",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PendingRow({ request }: { request: DeletionRequestView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: DeletionDecision) {
    const explanation = describeDecision(request.kind, decision);
    if (
      !window.confirm(
        `${BUTTON_LABELS[decision]} for ${request.name}?\n\n${explanation}${decision === "reject" ? "" : "\n\nThis can't be undone."}`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await processAccountDeletionAction(
        request.id,
        decision,
        "",
      );
      if (result.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{request.name}</span>
            <Badge variant="secondary">{KIND_LABELS[request.kind]}</Badge>
            {request.churchName && (
              <Badge variant="outline">{request.churchName}</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Asked {formatWhen(request.requestedAt)}
          </span>
        </div>
        {request.contact && (
          <p className="text-xs text-muted-foreground">{request.contact}</p>
        )}
        {request.reason && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">
            &ldquo;{request.reason}&rdquo;
          </p>
        )}
        <ErrorToast message={error} />
        <div className="flex flex-wrap gap-2">
          {allowedDecisions(request.kind).map((decision) => (
            <Button
              key={decision}
              type="button"
              size="sm"
              variant={decision === "reject" ? "outline" : "destructive"}
              disabled={pending}
              onClick={() => decide(decision)}
            >
              {BUTTON_LABELS[decision]}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Account deletion requests raised from the mobile app: the open ones with
// the choices for each, then a short history of the ones already handled.
export function DeletionRequestsList({
  requests,
  emptyText,
}: {
  requests: DeletionRequestView[];
  emptyText: string;
}) {
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending").slice(0, 8);

  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {emptyText}
          </CardContent>
        </Card>
      ) : (
        pending.map((request) => (
          <PendingRow key={request.id} request={request} />
        ))
      )}

      {done.length > 0 && (
        <div className="space-y-1 pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Recently handled
          </p>
          {done.map((request) => (
            <p key={request.id} className="text-sm text-muted-foreground">
              {request.name} ·{" "}
              {OUTCOME_LABELS[request.outcome ?? ""] ?? request.status}
              {request.processedAt
                ? ` · ${formatWhen(request.processedAt)}`
                : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
