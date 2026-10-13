"use client";

import { Activity } from "lucide-react";
import type { StreamHealth } from "@/lib/livestream/health-assess";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LEVELS = {
  good: { label: "Healthy", variant: "default" as const },
  fair: { label: "Fair", variant: "secondary" as const },
  poor: { label: "Poor", variant: "destructive" as const },
  offline: { label: "Not live", variant: "outline" as const },
};

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-heading text-xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// How the broadcast is doing right now: delay behind real time, whether the feed is fresh, how viewers' playback is going.
export function StreamHealthPanel({ health }: { health: StreamHealth | null | undefined }) {
  if (!health) return null;
  const level = LEVELS[health.level];
  const { feed, viewers } = health;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Activity className="size-4" />
          Stream health
          <Badge variant={level.variant}>{level.label}</Badge>
          {health.ingestActive && <Badge variant="outline">OBS connected</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {health.level !== "offline" && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Delay" value={health.estimatedDelaySeconds !== null ? `~${Math.round(health.estimatedDelaySeconds)} s` : "—"} hint="Estimated, behind real time" />
            <Metric label="Feed" value={feed.reachable ? (feed.ageSeconds !== null ? `${feed.ageSeconds.toFixed(1)} s old` : "Reachable") : "Unreachable"} hint="Newest video from the room" />
            <Metric label="Buffering" value={viewers.count > 0 ? `${viewers.bufferingCount} of ${viewers.count}` : "—"} hint="Viewers waiting on video" />
            <Metric label="Viewer ping" value={viewers.avgRttMs !== null ? `${Math.round(viewers.avgRttMs)} ms` : "—"} hint={viewers.stalls > 0 ? `${viewers.stalls} stalls so far` : "Average"} />
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {health.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {health.level !== "offline" && <p className="text-xs text-muted-foreground">Delay is an estimate from the video feed and what viewers report. Live streams on the web normally run 10 to 20 seconds behind.</p>}
      </CardContent>
    </Card>
  );
}
