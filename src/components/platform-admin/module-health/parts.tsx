import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { TrendInfo, ModuleHealthLabel } from "@/lib/module-health/math";
import { formatCompact } from "@/lib/module-health/math";

export function Kpi({ label, value, hint, trend, icon }: { label: string; value: string | number; hint?: string; trend?: TrendInfo; icon?: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <p className="font-heading text-2xl font-bold tabular-nums">{typeof value === "number" ? formatCompact(value) : value}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend ? <TrendBadge trend={trend} /> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendBadge({ trend }: { trend: TrendInfo }) {
  if (trend.direction === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600">
        <Sparkles className="size-3" /> new
      </span>
    );
  }
  if (trend.percent === null) return <span className="inline-flex items-center gap-0.5"><ArrowRight className="size-3" /> flat</span>;
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : ArrowRight;
  const color = trend.direction === "up" ? "text-emerald-600" : trend.direction === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${color}`}>
      <Icon className="size-3" />
      {trend.percent > 0 ? "+" : ""}
      {trend.percent}%
    </span>
  );
}

const LABEL_STYLE: Record<ModuleHealthLabel, { text: string; className: string }> = {
  healthy: { text: "Healthy", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  quiet: { text: "Quiet", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  unused: { text: "Not used", className: "bg-muted text-muted-foreground" },
  attention: { text: "Needs attention", className: "bg-destructive/15 text-destructive" },
};

export function HealthBadge({ health }: { health: ModuleHealthLabel }) {
  const s = LABEL_STYLE[health];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.text}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = status === "live" ? "secondary" : status === "off" ? "destructive" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
