import Link from "next/link";
import { AlertTriangle, Building2, Database, HardDrive, Layers, TriangleAlert, Zap } from "lucide-react";
import type { ModuleHealthReport } from "@/lib/module-health/service";
import { MODULE_GROUPS } from "@/lib/module-health/registry";
import { formatCompact, trendBetween } from "@/lib/module-health/math";
import { Card, CardContent } from "@/components/ui/card";
import { Kpi, HealthBadge, StatusBadge, TrendBadge } from "@/components/platform-admin/module-health/parts";
import { ProgressBar, Sparkline } from "@/components/platform-admin/module-health/charts";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";


function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}


export function ModuleHealthView({ report }: { report: ModuleHealthReport }) {
  const tracked = report.modules.filter((m) => m.tracked);
  const inUse = tracked.filter((m) => m.activeChurches30 > 0).length;
  const records = tracked.reduce((sum, m) => sum + (m.records?.total ?? 0), 0);
  const last30 = tracked.reduce((sum, m) => sum + (m.records?.last30 ?? 0) + (m.activity?.last30 ?? 0), 0);
  const prev30 = tracked.reduce((sum, m) => sum + (m.records?.prev30 ?? 0) + (m.activity?.prev30 ?? 0), 0);
  const attention = report.modules.filter((m) => m.health === "attention");
  const quiet = report.modules.filter((m) => m.health === "quiet");

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Module health</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            How each module is being used across every church: how much is in it, how much is happening, who uses it and what is going wrong. Counted from what churches already record, so history is complete.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Updated {formatPlatformDateTime(report.generatedAt)}</p>
          <Link href="/platform-admin/module-health?refresh=1" className="text-primary hover:underline">
            Refresh now
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Active churches (30 days)" value={`${report.activeChurches30} / ${report.totalChurches}`} hint="used any module" icon={<Building2 className="size-4" />} />
        <Kpi label="Modules in use" value={`${inUse} / ${tracked.length}`} hint="with activity in 30 days" icon={<Layers className="size-4" />} />
        <Kpi label="Records" value={records} hint="across all modules" icon={<Database className="size-4" />} />
        <Kpi label="Activity (30 days)" value={last30} trend={trendBetween(last30, prev30)} hint="vs the 30 before" icon={<Zap className="size-4" />} />
        <Kpi label="Errors (7 days)" value={report.errors7d} hint={report.errors7d === 0 ? "none logged" : "see the modules below"} icon={<TriangleAlert className="size-4" />} />
        <Kpi
          label="Storage"
          value={report.storage ? bytes(report.storage.fileStorageBytes + report.storage.databaseBytes) : "—"}
          hint={report.storage ? `${bytes(report.storage.fileStorageBytes)} files · ${bytes(report.storage.databaseBytes)} database` : "not available"}
          icon={<HardDrive className="size-4" />}
        />
      </div>

      {(attention.length > 0 || quiet.length > 0) && (
        <Card className="border-amber-500/40">
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 text-amber-600" /> Worth a look
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {attention.map((m) => (
                <li key={m.key}>
                  <Link className="font-medium text-foreground hover:underline" href={`/platform-admin/module-health/${m.key}`}>
                    {m.label}
                  </Link>{" "}
                  logged {m.errors7d} error{m.errors7d === 1 ? "" : "s"} in the last 7 days.
                </li>
              ))}
              {quiet.length > 0 && (
                <li>
                  Quiet for 30 days even though churches have data:{" "}
                  {quiet.map((m, i) => (
                    <span key={m.key}>
                      {i > 0 ? ", " : ""}
                      <Link className="font-medium text-foreground hover:underline" href={`/platform-admin/module-health/${m.key}`}>
                        {m.label}
                      </Link>
                    </span>
                  ))}
                  .
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {MODULE_GROUPS.map((group) => {
        const mods = report.modules.filter((m) => m.group === group);
        if (mods.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="font-heading text-xl font-bold">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mods.map((m) => {
                const main = m.records ?? m.activity;
                const pulse = m.activity ?? m.records;
                return (
                  <Link key={m.key} href={`/platform-admin/module-health/${m.key}`} className="block">
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardContent className="space-y-3 py-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-heading text-base font-bold">{m.label}</p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <StatusBadge status={m.status} />
                              <HealthBadge health={m.health} />
                            </div>
                          </div>
                          {main ? (
                            <div className="text-right">
                              <p className="font-heading text-2xl font-bold tabular-nums">{formatCompact(main.total)}</p>
                              <p className="text-xs text-muted-foreground">{main.noun}</p>
                            </div>
                          ) : null}
                        </div>
                        {pulse ? (
                          <>
                            <Sparkline values={pulse.weekly} label={`${pulse.noun} per week, last 12 weeks`} />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {formatCompact(pulse.last30)} {pulse.noun} in 30 days
                              </span>
                              <TrendBadge trend={pulse.trend} />
                            </div>
                          </>
                        ) : (
                          <p className="py-4 text-xs text-muted-foreground">Not measured yet: this module has no records of its own to count.</p>
                        )}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {m.churchesEver} of {report.totalChurches} churches use it
                            </span>
                            <span>{m.activeChurches30} active</span>
                          </div>
                          <ProgressBar percent={m.adoptionPercent} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
