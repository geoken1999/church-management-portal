"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideProgramEnrollmentAction,
  type LmsResult,
} from "@/lib/lms/actions";
import type { ProgramRequestRow } from "@/lib/lms/dal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

// Requests members made in the app to join a program. Joining happens at program level, so approving one
// enrolls the member in every course of the program.
export function ProgramRequestsPanel({
  organizationId,
  requests,
}: {
  organizationId: string;
  requests: ProgramRequestRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(id: string, action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result = await decideProgramEnrollmentAction(
        organizationId,
        id,
        action,
      ).catch((): LmsResult => ({
        error: "Something went wrong. Check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (requests.length === 0) return null;
  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3">
        <ErrorToast message={error} />
        <div>
          <p className="font-medium">
            Program requests waiting ({requests.length})
          </p>
          <p className="text-sm text-muted-foreground">
            Members asked to join these programs from the app. Approving enrolls
            them in every course of the program.
          </p>
        </div>
        {requests.map((request) => (
          <div
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
          >
            <div>
              <p className="text-sm font-medium">{request.studentName}</p>
              <p className="text-xs text-muted-foreground">
                {request.studentPhone ? `${request.studentPhone} · ` : ""}
                wants to join{" "}
                <Link
                  href={`/dashboard/bible-school/programs/${request.programId}`}
                  className="underline"
                >
                  {request.programTitle}
                </Link>{" "}
                · {new Date(request.requestedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => decide(request.id, "approve")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => decide(request.id, "reject")}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
