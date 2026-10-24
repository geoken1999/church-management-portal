"use client";

import { useState, useTransition } from "react";
import { retryEnrolmentAction } from "@/lib/lms/unenrolled-actions";
import { Button } from "@/components/ui/button";

export function RetryEnrolmentButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await retryEnrolmentAction(orderId);
            if (result.error) setError(result.error);
          })
        }
      >
        {pending ? "Enrolling…" : "Enrol now"}
      </Button>
      {error && <p className="max-w-xs text-xs text-destructive">{error}</p>}
    </div>
  );
}
