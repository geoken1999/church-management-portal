"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { processDeletionFormRequestAction } from "@/lib/account-deletion/form-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorToast } from "@/components/ui/error-toast";

export interface WebDeletionRequest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  churchName: string | null;
  relationship: string;
  scope: string;
  details: string | null;
  status: "unverified" | "pending" | "completed" | "rejected";
  verifiedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

function Row({ request }: { request: WebDeletionRequest }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "completed" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await processDeletionFormRequestAction(
        request.id,
        decision,
        note,
      );
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <ErrorToast message={error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{request.name}</span>
            <Badge variant="secondary">{request.relationship}</Badge>
            {request.churchName && (
              <Badge variant="outline">{request.churchName}</Badge>
            )}
            <Badge variant="outline">
              {request.scope === "account"
                ? "Account only"
                : "Account and records"}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            Confirmed{" "}
            {request.verifiedAt
              ? new Date(request.verifiedAt).toLocaleString()
              : "—"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {request.email}
          {request.phone ? ` · ${request.phone}` : ""}
        </p>
        {request.details && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">
            &ldquo;{request.details}&rdquo;
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The email is confirmed but nothing else is: find the person (by email
          or phone), delete them in the church&apos;s records or Supabase Auth,
          then mark it done.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Note to the person (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => decide("completed")}
          >
            Mark deleted
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => decide("rejected")}
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Requests from the public /delete-account form, confirmed by email.
export function WebDeletionRequests({
  requests,
  unconfirmed,
}: {
  requests: WebDeletionRequest[];
  unconfirmed: number;
}) {
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests
    .filter((r) => r.status === "completed" || r.status === "rejected")
    .slice(0, 8);
  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No confirmed web-form requests.
          </CardContent>
        </Card>
      ) : (
        pending.map((r) => <Row key={r.id} request={r} />)
      )}
      {unconfirmed > 0 && (
        <p className="text-xs text-muted-foreground">
          {unconfirmed} {unconfirmed === 1 ? "request is" : "requests are"}{" "}
          waiting for the person to confirm by email.
        </p>
      )}
      {done.length > 0 && (
        <div className="space-y-1 pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Recently handled
          </p>
          {done.map((r) => (
            <p key={r.id} className="text-sm text-muted-foreground">
              {r.name} · {r.status === "completed" ? "Deleted" : "Declined"}
              {r.processedAt
                ? ` · ${new Date(r.processedAt).toLocaleDateString()}`
                : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
