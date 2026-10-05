"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFollowupStatus } from "@/lib/automations/followup-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FollowupStatusControl({ automationId, status }: { automationId: string; status: "draft" | "active" | "paused" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (next: "active" | "paused") => {
    setError(null);
    startTransition(async () => {
      const result = await setFollowupStatus(automationId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {status === "active" ? (
        <Button variant="outline" onClick={() => change("paused")} disabled={isPending}>
          {isPending ? "Pausing…" : "Pause"}
        </Button>
      ) : (
        <Button onClick={() => change("active")} disabled={isPending}>
          {isPending ? "Activating…" : status === "paused" ? "Resume" : "Activate"}
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
