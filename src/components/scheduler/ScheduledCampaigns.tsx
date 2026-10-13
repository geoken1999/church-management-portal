"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { cancelScheduledCampaignAction } from "@/lib/scheduler/actions";
import { formatInTimezone } from "@/lib/organizations/timezone";
import type { ScheduledCampaign } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

const STATUS = {
  scheduled: { label: "Scheduled", variant: "secondary" as const },
  sending: { label: "Sending", variant: "default" as const },
  sent: { label: "Sent", variant: "outline" as const },
  failed: { label: "Didn't go out", variant: "destructive" as const },
  cancelled: { label: "Cancelled", variant: "outline" as const },
};

// What is waiting to go out on this channel, and how the latest scheduled ones went.
export function ScheduledCampaigns({ items, timezone }: { items: ScheduledCampaign[]; timezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;

  function cancel(id: string) {
    if (!window.confirm("Cancel this scheduled campaign? It won't be sent.")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelScheduledCampaignAction(id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          Scheduled
        </CardTitle>
        <CardDescription>Times are in your church&apos;s time zone ({timezone}).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ErrorToast message={error} />
        {items.map((item) => {
          const status = STATUS[item.status];
          return (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{item.summary || "Untitled"}</span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatInTimezone(item.scheduled_at, timezone, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }, "en-IN")} · {item.recipient_count} recipient{item.recipient_count === 1 ? "" : "s"}
                  {item.attachments.length > 0 && ` · ${item.attachments.length} attachment${item.attachments.length === 1 ? "" : "s"}`}
                </p>
                {item.status === "sent" && item.result?.sentCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Sent to {item.result.sentCount}
                    {item.result.failedCount ? `, ${item.result.failedCount} failed` : ""}
                    {item.result.skippedCount ? `, ${item.result.skippedCount} skipped` : ""}.
                  </p>
                )}
                {item.status === "scheduled" && Date.parse(item.scheduled_at) < Date.now() - 15 * 60_000 && (
                  <p className="text-xs text-amber-600">This is overdue. It will be sent as soon as the sender catches up. If it stays here, contact support.</p>
                )}
                {item.status === "failed" && item.result?.error && <p className="text-xs text-destructive">{item.result.error}</p>}
              </div>
              {item.status === "scheduled" && (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => cancel(item.id)}>
                  <X className="size-3.5" />
                  Cancel
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
