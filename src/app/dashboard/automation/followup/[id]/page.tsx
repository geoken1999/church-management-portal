import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanLimits } from "@/lib/plans/dal";
import { getFollowupAutomation, getFollowupRuns, getFollowupRunItems } from "@/lib/automations/followup-dal";
import { readFollowupConfig } from "@/lib/automations/followup-config";
import { dateKeyInTimezone, formatInTimezone } from "@/lib/organizations/timezone";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { FollowupStatusControl } from "@/components/automation/FollowupStatusControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AutomationRunItemOutcome, AutomationRunStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Member Follow-up | KingdomFlow",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const OUTCOME_LABEL: Record<AutomationRunItemOutcome, string> = {
  task_created: "Task created",
  skipped_existing_task: "Already has an open task",
  skipped_data_quality: "Skipped (register not complete)",
  error: "Error",
};

function runBadge(status: AutomationRunStatus) {
  if (status === "completed") return <Badge variant="secondary">Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Running</Badge>;
}

// The next date the daily job will find the configured weekday, in the
// organization's own timezone.
function nextRunDate(runWeekday: number, timezone: string, now: Date): Date {
  const today = dateKeyInTimezone(now, timezone);
  const base = new Date(`${today}T12:00:00Z`);
  const ahead = (runWeekday - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + ahead);
  return base;
}

export default async function FollowupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const { run: runParam } = await searchParams;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const timezone = membership.organization.timezone;

  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) {
    return <UpgradeRequired label="Automation" plan={plan.name} />;
  }
  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automation" />;
  }

  const automation = await getFollowupAutomation(organizationId, id);
  if (!automation) notFound();
  const config = readFollowupConfig(automation.config);
  const canWrite = membership.tabAccess.automations.write;

  const runs = await getFollowupRuns(organizationId, id);
  const selectedRun = runs.find((r) => r.id === runParam) ?? runs[0] ?? null;
  const items = selectedRun ? await getFollowupRunItems(organizationId, selectedRun.id) : [];

  const latestCompleted = runs.find((r) => r.status === "completed") ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/automation/followup" />}>
            <ArrowLeft className="size-4" />
            Member follow-up
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-bold tracking-tight">{automation.name}</h1>
            <Badge variant={automation.status === "active" ? "secondary" : "outline"}>
              {automation.status === "active" ? "Active" : automation.status === "paused" ? "Paused" : "Draft"}
            </Badge>
          </div>
          {config?.branchIds === null && <p className="mt-1 text-muted-foreground">All branches</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/automation/followup/${id}/edit`} />}>
              <Pencil className="size-4" />
              Edit
            </Button>
          )}
          {canWrite && <FollowupStatusControl automationId={id} status={automation.status} />}
        </div>
      </div>

      {!config && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            These settings are incomplete, so this automation won&apos;t run. Edit it to fix them.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Trigger</CardDescription>
            <CardTitle className="text-base">
              {config ? `${config.requiredConsecutive} missed Sundays in a row` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Only Sundays whose register was marked complete count.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Schedule</CardDescription>
            <CardTitle className="text-base">{config ? `${WEEKDAYS[config.runWeekday]}s` : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {automation.status === "active" && config
              ? `Next run ${formatInTimezone(nextRunDate(config.runWeekday, timezone, new Date()).toISOString(), timezone, { weekday: "long", day: "numeric", month: "long" })}`
              : "Runs only while active"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Last run</CardDescription>
            <CardTitle className="text-base">
              {automation.last_run_at
                ? formatInTimezone(automation.last_run_at, timezone, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                : "Not run yet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {latestCompleted
              ? `${latestCompleted.members_qualified} member${latestCompleted.members_qualified === 1 ? "" : "s"} flagged`
              : "No completed runs yet"}
          </CardContent>
        </Card>
      </div>

      {config && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment</CardTitle>
            <CardDescription>
              {config.priority} priority · due {config.dueWorkingDays} working day{config.dueWorkingDays === 1 ? "" : "s"} after the task is created
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tasks go to the assignee as To Do items. The assignee is notified without any member&apos;s name. A new task for the same member is only
            created after the previous one is completed.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
          <CardDescription>Every scheduled check is recorded here, including ones that found nobody to flag.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Tasks</th>
                    <th className="py-2 pr-4 font-medium">Skipped</th>
                    <th className="py-2 pr-4 font-medium">Errors</th>
                    <th className="py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className={run.id === selectedRun?.id ? "bg-accent/50" : undefined}>
                      <td className="py-2 pr-4">
                        {formatInTimezone(run.started_at, timezone, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className="py-2 pr-4">{runBadge(run.status)}</td>
                      <td className="py-2 pr-4">{run.tasks_created}</td>
                      <td className="py-2 pr-4">{run.skipped_count}</td>
                      <td className="py-2 pr-4">{run.error_count}</td>
                      <td className="py-2">
                        <Link className="text-primary underline-offset-4 hover:underline" href={`/dashboard/automation/followup/${id}?run=${run.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedRun?.error_summary && (
            <p className="mt-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{selectedRun.error_summary}</p>
          )}
        </CardContent>
      </Card>

      {selectedRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members in this run</CardTitle>
            <CardDescription>
              {selectedRun.members_evaluated} evaluated · {selectedRun.members_qualified} qualified · {selectedRun.notifications_sent} notification
              {selectedRun.notifications_sent === 1 ? "" : "s"} sent
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members were flagged in this run.</p>
            ) : (
              <ul className="divide-y text-sm">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{item.memberName}</span>
                    <span className="text-muted-foreground">
                      {OUTCOME_LABEL[item.outcome]}
                      {item.error_message ? ` — ${item.error_message}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
