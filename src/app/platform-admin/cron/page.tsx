import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCronJobs } from "@/lib/cron/registry";
import { describeSchedule, lastExpectedRun } from "@/lib/cron/schedule";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";
import { RunCronJobButton } from "@/components/platform-admin/RunCronJobButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CronJobRun } from "@/types/database";

export const metadata: Metadata = {
  title: "Cron Jobs | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

const STATUS_VARIANTS: Record<CronJobRun["status"], "default" | "secondary" | "destructive"> = {
  success: "secondary",
  running: "default",
  error: "destructive",
};

function summarize(summary: Record<string, unknown> | null): string {
  if (!summary) return "";
  return Object.entries(summary)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export default async function PlatformAdminCronPage() {
  await requirePlatformAdmin();
  const jobs = getCronJobs();
  const now = new Date();

  const admin = createAdminClient();
  const { data } = await admin.from("cron_job_runs").select("*").order("started_at", { ascending: false }).limit(300);
  const runs = (data ?? []) as CronJobRun[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Cron jobs</h1>
        <p className="mt-1 text-muted-foreground">
          The scheduled jobs Vercel runs, whether each one ran when it should have, and a way to run one by hand. Run history
          starts from when this page was first deployed.
        </p>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => {
          const jobRuns = runs.filter((run) => run.job_key === job.key);
          const lastRun = jobRuns[0];
          const lastScheduled = jobRuns.find((run) => run.trigger === "schedule");
          const expected = lastExpectedRun(job.schedule, now);
          // A scheduled run is "on time" if one started within a few hours after
          // the slot (Vercel can fire late); anything started before the slot
          // is the previous day's.
          const missed = expected && (!lastScheduled || new Date(lastScheduled.started_at).getTime() < expected.getTime());

          return (
            <Card key={job.key}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{job.label}</span>
                      {lastRun && <Badge variant={STATUS_VARIANTS[lastRun.status]}>{lastRun.status}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{job.description}</p>
                    <p className="text-xs text-muted-foreground">{describeSchedule(job.schedule)} · {job.path}</p>
                  </div>
                  <RunCronJobButton jobKey={job.key} label={job.label} />
                </div>

                {missed && expected && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    No scheduled run recorded since {formatPlatformDateTime(expected)}.{" "}
                    {lastScheduled ? `The last one started ${formatPlatformDateTime(lastScheduled.started_at)}.` : "None has been recorded yet."}
                  </p>
                )}

                {lastRun && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Last run: </span>
                    {formatPlatformDateTime(lastRun.started_at)} ({lastRun.trigger === "manual" ? `manual, ${lastRun.triggered_by_email ?? "unknown"}` : "scheduled"})
                    {lastRun.summary && <p className="mt-0.5 break-words text-xs text-muted-foreground">{summarize(lastRun.summary)}</p>}
                    {lastRun.error_message && <p className="mt-0.5 text-xs text-destructive">{lastRun.error_message}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-2">
        <h2 className="font-heading text-xl font-semibold">Recent runs</h2>
        {runs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No runs recorded yet.</CardContent>
          </Card>
        ) : (
          runs.slice(0, 40).map((run) => (
            <Card key={run.id}>
              <CardContent className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[run.status]}>{run.status}</Badge>
                    <span className="text-sm font-medium">{jobs.find((j) => j.key === run.job_key)?.label ?? run.job_key}</span>
                    <span className="text-xs text-muted-foreground">{run.trigger === "manual" ? `manual · ${run.triggered_by_email ?? "unknown"}` : "scheduled"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatPlatformDateTime(run.started_at)}</span>
                </div>
                {run.summary && <p className="break-words text-xs text-muted-foreground">{summarize(run.summary)}</p>}
                {run.error_message && <p className="text-xs text-destructive">{run.error_message}</p>}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
