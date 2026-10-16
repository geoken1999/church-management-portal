"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmDeletionRequest } from "@/lib/account-deletion/form-actions";
import { Button } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";

export function ConfirmDeletionButton({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-9 text-primary" />
        <p className="font-heading text-lg font-bold">Request confirmed</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Our team has it. We&apos;ll email you when your account has been
          deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ErrorToast message={error} />
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await confirmDeletionRequest(token);
            if (result.error) setError(result.error);
            else setDone(true);
          });
        }}
      >
        {pending ? "Confirming..." : "Yes, delete my account"}
      </Button>
    </div>
  );
}
