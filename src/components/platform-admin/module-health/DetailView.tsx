import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ModuleHealthReport, SourceHealth } from "@/lib/module-health/service";
import { formatCompact } from "@/lib/module-health/math";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kpi, HealthBadge, StatusBadge } from "@/components/platform-admin/module-health/parts";
import { BarChart, ProgressBar } from "@/components/platform-admin/module-health/charts";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";


const DAY = 86_400_000;

function weekLabels(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const end = new Date(now.getTime() - (count - 1 - i) * 7 * DAY);
    return end.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  });
}

function dayLabels(now: Date): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * DAY);
    return i % 5 === 0 || i === 29 ? String(d.getUTCDate()) : "";
  });
}

function SourceSection({ title, source, now }: { title: string; source: SourceHealth; now: Date }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">{title}</h2>
        {source.capped && <span className="text-xs text-muted-foreground">Charts cover the newest 20,000 rows</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Total ${source.noun}`} value={source.total} />
        <Kpi label="Last 7 days" value={source.last7} />
        <Kpi label="Last 30 days" value={source.last30} trend={source.trend} hint="vs the 30 before" />
        <Kpi label="Churches active (30 days)" value={source.churchesActive30} hint={`of ${source.churchesEver} that have any`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per week</CardTitle>
            <CardDescription>The last 12 weeks, newest on the right.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart values={source.weekly} labels={weekLabels(now, 12).map((l, i) => (i % 2 === 1 ? l : ""))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per day</CardTitle>
            <CardDescription>The last 30 days, today on the right.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart values={source.daily} labels={dayLabels(now)} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Busiest churches (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {source.topChurches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has used this in the last 30 days.</p>
          ) : (
            source.topChurches.map((c) => (
              <div key={c.organizationId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <div className="space-y-1">
                  <Link href={`/platform-admin/tenants/${c.organizationId}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <ProgressBar percent={(c.last30 / Math.max(1, source.topChurches[0].last30)) * 100} />
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {formatCompact(c.last30)} {source.noun}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}


export function ModuleDetailView({ report, moduleKey }: { report: ModuleHealthReport; moduleKey: string }) {
  const m = report.modules.find((x) => x.key === moduleKey);
  if (!m) notFound();
  const now = new Date(report.generatedAt);
  const errors = report.errors[m.key] ?? [];

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <Link href="/platform-admin/module-health" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All modules
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{m.label}</h1>
          <StatusBadge status={m.status} />
          <HealthBadge health={m.health} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.group} · switch it on or off for every church under{" "}
          <Link href="/platform-admin/feature-flags" className="text-primary hover:underline">
            Feature flags
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Churches that use it" value={`${m.churchesEver} / ${report.totalChurches}`} hint={`${m.adoptionPercent}% adoption`} />
        <Kpi label="Active (30 days)" value={m.activeChurches30} hint="churches with activity" />
        <Kpi label="Errors (7 days)" value={m.errors7d} hint={m.errors7d === 0 ? "none logged" : "listed below"} />
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="text-xs text-muted-foreground">Adoption</p>
            <ProgressBar percent={m.adoptionPercent} tone={m.adoptionPercent >= 50 ? "good" : "primary"} />
            <p className="text-xs text-muted-foreground">
              {m.churchesEver} of {report.totalChurches} churches have used it
            </p>
          </CardContent>
        </Card>
      </div>

      {!m.tracked && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This module has no records of its own in the database yet, so there is nothing to measure. It will show here once it does.
          </CardContent>
        </Card>
      )}

      {m.records && <SourceSection title={`Records: ${m.records.noun}`} source={m.records} now={now} />}
      {m.activity && <SourceSection title={`Activity: ${m.activity.noun}`} source={m.activity} now={now} />}

      {(m.tracked || errors.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-bold">Errors and warnings (7 days)</h2>
          {errors.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing logged for this module.</CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {errors.slice(0, 30).map((e) => (
                <Card key={e.id}>
                  <CardContent className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Badge variant={e.level === "error" ? "destructive" : "default"}>{e.level}</Badge>
                        <span>{e.source}</span>
                        <Badge variant="outline">{e.churchName ?? "Platform"}</Badge>
                      </span>
                      <span>{formatPlatformDateTime(e.createdAt)}</span>
                    </div>
                    <p className="text-sm">{e.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
