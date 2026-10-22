"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Approve / Reject for a request. Both buttons lock and the one clicked spins until the
// server action has finished, so nobody keeps clicking while the page catches up.
export function ReviewButtons({
  approve,
  reject,
  field,
  value,
  rejectLabel = "Reject",
  rejectVariant = "outline",
}: {
  approve: (formData: FormData) => void | Promise<void>;
  reject: (formData: FormData) => void | Promise<void>;
  field: string;
  value: string;
  rejectLabel?: string;
  rejectVariant?: "outline" | "ghost";
}) {
  const [pending, startTransition] = useTransition();
  const [which, setWhich] = useState<"approve" | "reject" | null>(null);

  function run(kind: "approve" | "reject") {
    setWhich(kind);
    startTransition(async () => {
      const formData = new FormData();
      formData.set(field, value);
      await (kind === "approve" ? approve : reject)(formData);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => run("approve")}>
        {pending && which === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {pending && which === "approve" ? "Approving…" : "Approve"}
      </Button>
      <Button type="button" size="sm" variant={rejectVariant} disabled={pending} onClick={() => run("reject")}>
        {pending && which === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        {pending && which === "reject" ? "Rejecting…" : rejectLabel}
      </Button>
    </div>
  );
}
