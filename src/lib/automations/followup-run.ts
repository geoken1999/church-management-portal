import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { Automation, AutomationRunItemOutcome } from "@/types/database";
import { evaluateFollowup } from "@/lib/automations/followup-eligibility";
import { readFollowupConfig, type FollowupConfig } from "@/lib/automations/followup-config";
import { partsInTimezone, zonedTimeToUtc, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { sendPushToUsers } from "@/lib/push/client";
import { logPlatformEvent } from "@/lib/platform-events/log";

type AdminClient = ReturnType<typeof createAdminClient>;

// How many recent Sundays to look at. Must be at least the largest allowed
// consecutive count (12), so a 12-week rule always has enough history.
const SUNDAY_LOOKBACK = 12;
const MEMBER_PAGE_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
// A run still "running" after this long is treated as dead.
const STALE_RUN_MS = 15 * 60 * 1000;

interface LocalDay {
  year: number;
  month: number;
  day: number;
  weekday: number;
  dateKey: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Today's calendar date and weekday in the organization's own timezone.
function localDay(now: Date, timeZone: string): LocalDay {
  const { year, month, day } = partsInTimezone(now, timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday, dateKey: dateKey(year, month, day) };
}

// Sundays on or before today, most recent first.
function recentSundays(today: LocalDay, count: number): string[] {
  const base = Date.UTC(today.year, today.month - 1, today.day);
  const daysSinceSunday = new Date(base).getUTCDay();
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base - (daysSinceSunday + 7 * i) * DAY_MS);
    result.push(dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  }
  return result;
}

// Due date: N working days (Mon-Fri) after today, end of that local day.
function dueAt(today: LocalDay, workingDays: number, timeZone: string): string {
  let cursor = Date.UTC(today.year, today.month - 1, today.day);
  let remaining = workingDays;
  while (remaining > 0) {
    cursor += DAY_MS;
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  const d = new Date(cursor);
  const key = dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return zonedTimeToUtc(`${key}T23:59`, timeZone).toISOString();
}

interface RunCounts {
  evaluated: number;
  qualified: number;
  tasksCreated: number;
  notificationsSent: number;
  skipped: number;
  errors: number;
}

async function runOne(admin: AdminClient, automation: Automation, now: Date): Promise<void> {
  const { data: org } = await admin.from("organizations").select("timezone").eq("id", automation.organization_id).maybeSingle();
  const timeZone = org?.timezone || DEFAULT_TIMEZONE;
  const today = localDay(now, timeZone);

  const config = readFollowupConfig(automation.config);
  if (!config) return;
  if (today.weekday !== config.runWeekday) return;

  // One run per automation per local day. The unique run_key makes a retry
  // or an overlapping invocation a no-op.
  const runKey = `${automation.id}:${today.dateKey}`;
  const { data: run, error: insertError } = await admin
    .from("automation_runs")
    .insert({ organization_id: automation.organization_id, automation_id: automation.id, run_key: runKey, status: "running" })
    .select("id")
    .single();
  if (insertError || !run) {
    // A run for today already exists. If it has been "running" for too long,
    // its process died, so mark it failed. Today's check isn't retried.
    const { data: existing } = await admin
      .from("automation_runs")
      .select("id, status, started_at")
      .eq("run_key", runKey)
      .maybeSingle();
    if (existing && existing.status === "running" && now.getTime() - new Date(existing.started_at).getTime() > STALE_RUN_MS) {
      await admin
        .from("automation_runs")
        .update({ status: "failed", completed_at: now.toISOString(), error_count: 1, error_summary: "Run did not finish and was marked failed." })
        .eq("id", existing.id);
    }
    return;
  }

  try {
    await runEvaluation(admin, automation, config, run.id, today, timeZone);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await admin
      .from("automation_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_count: 1, error_summary: message })
      .eq("id", run.id);
    await logPlatformEvent({
      level: "error",
      source: "automation_send",
      message: `Member follow-up run failed: ${message}`,
      organizationId: automation.organization_id,
      metadata: { automationId: automation.id, runId: run.id },
    });
  }
}

async function runEvaluation(
  admin: AdminClient,
  automation: Automation,
  config: FollowupConfig,
  runId: string,
  today: LocalDay,
  timeZone: string,
): Promise<void> {
  const organizationId = automation.organization_id;

  // The assignee must still belong to the organization. A removed staff
  // member stops the run with a clear error instead of creating orphan tasks.
  const { data: assigneeMembership } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", config.assigneeUserId)
    .maybeSingle();
  if (!assigneeMembership) throw new Error("The assigned leader is no longer a member of this organization.");

  const sundays = recentSundays(today, SUNDAY_LOOKBACK);

  let sessionQuery = admin
    .from("attendance_sessions")
    .select("id, occurrence_date, recorded_at")
    .eq("organization_id", organizationId)
    .in("occurrence_date", sundays);
  if (config.branchIds) sessionQuery = sessionQuery.in("branch_id", config.branchIds);
  const { data: sessions } = await sessionQuery;

  // A Sunday counts as recorded only if an in-scope session for it was marked
  // complete. Unrecorded sessions are never read as absence.
  const recordedSundays = new Set<string>();
  const recordedSessionIds: string[] = [];
  for (const session of sessions ?? []) {
    if (session.recorded_at) {
      recordedSundays.add(session.occurrence_date);
      recordedSessionIds.push(session.id);
    }
  }
  const sessionDates = new Map((sessions ?? []).map((s) => [s.id, s.occurrence_date]));

  const counts: RunCounts = { evaluated: 0, qualified: 0, tasksCreated: 0, notificationsSent: 0, skipped: 0, errors: 0 };

  const windowCheck = evaluateFollowup({
    sundays,
    recordedSundays,
    presentByDate: new Map(),
    memberIds: [],
    requiredConsecutive: config.requiredConsecutive,
  });
  if (windowCheck.insufficientData) {
    counts.skipped = windowCheck.skippedUnrecordedSundays.length;
    await finishRun(admin, runId, automation.id, "completed", counts, {
      errorSummary: `Not enough recorded Sundays to check the last ${config.requiredConsecutive}. Mark the register complete for each Sunday to enable this follow-up.`,
    });
    return;
  }

  // Unrecorded Sundays are data-quality skips, reported rather than acted on.
  counts.skipped += windowCheck.skippedUnrecordedSundays.length;

  const taskDueAt = dueAt(today, config.dueWorkingDays, timeZone);
  const createdByAssignee = { count: 0 };
  let lastMemberId = "";

  while (true) {
    let memberQuery = admin
      .from("members")
      .select("id, branch_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("id", { ascending: true })
      .limit(MEMBER_PAGE_SIZE);
    if (lastMemberId) memberQuery = memberQuery.gt("id", lastMemberId);
    if (config.branchIds) memberQuery = memberQuery.in("branch_id", config.branchIds);
    const { data: members } = await memberQuery;
    if (!members || members.length === 0) break;

    lastMemberId = members[members.length - 1].id;
    const memberBranch = new Map(members.map((m) => [m.id, m.branch_id]));
    const memberIds = members.map((m) => m.id);
    counts.evaluated += memberIds.length;

    const presentByDate = new Map<string, Set<string>>();
    if (recordedSessionIds.length > 0) {
      const { data: records } = await admin
        .from("attendance_records")
        .select("session_id, member_id")
        .in("session_id", recordedSessionIds)
        .in("member_id", memberIds);
      for (const record of records ?? []) {
        const date = sessionDates.get(record.session_id);
        if (!date) continue;
        const set = presentByDate.get(date) ?? new Set<string>();
        set.add(record.member_id);
        presentByDate.set(date, set);
      }
    }

    const evaluation = evaluateFollowup({
      sundays,
      recordedSundays,
      presentByDate,
      memberIds,
      requiredConsecutive: config.requiredConsecutive,
    });
    counts.qualified += evaluation.qualifiedMemberIds.length;

    const { data: openTasks } = await admin
      .from("todos")
      .select("member_id")
      .eq("automation_id", automation.id)
      .eq("status", "pending")
      .in("member_id", evaluation.qualifiedMemberIds.length ? evaluation.qualifiedMemberIds : ["00000000-0000-0000-0000-000000000000"]);
    const alreadyOpen = new Set((openTasks ?? []).map((t) => t.member_id));

    const items: { run_id: string; organization_id: string; member_id: string; outcome: AutomationRunItemOutcome; todo_id?: string; error_message?: string }[] = [];

    for (const memberId of evaluation.qualifiedMemberIds) {
      if (alreadyOpen.has(memberId)) {
        counts.skipped += 1;
        items.push({ run_id: runId, organization_id: organizationId, member_id: memberId, outcome: "skipped_existing_task" });
        continue;
      }

      const { data: todo, error: todoError } = await admin
        .from("todos")
        .insert({
          organization_id: organizationId,
          title: "Member follow-up",
          description: `No recorded attendance for the last ${config.requiredConsecutive} recorded Sundays.`,
          due_at: taskDueAt,
          status: "pending",
          assigned_to: config.assigneeUserId,
          member_id: memberId,
          branch_id: memberBranch.get(memberId) ?? null,
          automation_id: automation.id,
          priority: config.priority,
        })
        .select("id")
        .single();

      if (todoError || !todo) {
        // 23505 is the partial unique index: a concurrent run already created
        // the open task for this member.
        const duplicate = todoError?.code === "23505";
        if (duplicate) {
          counts.skipped += 1;
          items.push({ run_id: runId, organization_id: organizationId, member_id: memberId, outcome: "skipped_existing_task" });
        } else {
          counts.errors += 1;
          items.push({ run_id: runId, organization_id: organizationId, member_id: memberId, outcome: "error", error_message: todoError?.message ?? "Insert failed" });
        }
        continue;
      }

      counts.tasksCreated += 1;
      createdByAssignee.count += 1;
      items.push({ run_id: runId, organization_id: organizationId, member_id: memberId, outcome: "task_created", todo_id: todo.id });
    }

    if (items.length > 0) {
      await admin.from("automation_run_items").upsert(items, { onConflict: "run_id,member_id" });
    }
  }

  // One push per run to the assignee, with no names or detail in the body.
  if (createdByAssignee.count > 0) {
    const n = createdByAssignee.count;
    await sendPushToUsers([config.assigneeUserId], "todo_assigned", {
      title: "New follow-up tasks",
      body: `${n} member follow-up task${n === 1 ? "" : "s"} assigned to you.`,
      data: { type: "todo_assigned" },
    });
    counts.notificationsSent = 1;
  }

  await finishRun(admin, runId, automation.id, "completed", counts, {});
}

async function finishRun(
  admin: AdminClient,
  runId: string,
  automationId: string,
  status: "completed" | "failed",
  counts: RunCounts,
  extra: { errorSummary?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("automation_runs")
    .update({
      status,
      completed_at: now,
      members_evaluated: counts.evaluated,
      members_qualified: counts.qualified,
      tasks_created: counts.tasksCreated,
      notifications_sent: counts.notificationsSent,
      skipped_count: counts.skipped,
      error_count: counts.errors,
      error_summary: extra.errorSummary ?? null,
    })
    .eq("id", runId);
  await admin.from("automations").update({ last_run_at: now }).eq("id", automationId);
}

// Entry point called from the daily automation cron. Only active automations
// of this type run, so paused and draft ones are never touched.
export async function runMemberFollowupAutomations(admin: AdminClient, now: Date = new Date()): Promise<{ automationsChecked: number }> {
  const { data: automations } = await admin
    .from("automations")
    .select("*")
    .eq("type", "member_followup")
    .eq("status", "active");

  for (const automation of automations ?? []) {
    await runOne(admin, automation as Automation, now);
  }

  return { automationsChecked: (automations ?? []).length };
}
