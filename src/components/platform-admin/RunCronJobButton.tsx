"use client";

import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { runCronJobAction, type RunCronJobResult } from "@/lib/platform-admin/cron-actions";
import { Button } from "@/components/ui/button";

// Plain confirm(), same reasoning as RevokeSessionButton: these jobs send
// real messages and charge real subscriptions, so a click must not fire one.
export function RunCronJobButton({ jobKey, label }: { jobKey: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RunCronJobResult | null>(null);

  function handleRun() {
    if (!window.confirm(`Run "${label}" now? It performs real actions (messages, billing, reminders) for every organization, exactly like the scheduled run. Work already done today is skipped, not repeated.`)) {
      return;
    }
    setResult(null);
    startTransition(async () => {
      setResult(await runCronJobAction(jobKey));
    });
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" size="sm" variant="outline" onClick={handleRun} disabled={pending}>
        <Play className="size-3.5" />
        {pending ? "Running..." : "Run now"}
      </Button>
      {result && <p className={`text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>{result.message}</p>}
    </div>
  );
}
