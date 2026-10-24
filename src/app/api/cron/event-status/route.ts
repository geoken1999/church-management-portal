import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasEventEnded } from "@/lib/events/status";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { withCronLogging } from "@/lib/cron/run-logger";

// Marks events whose date has passed as completed, so the saved status
// matches what the Events page already shows (it files a past event under
// Completed on its own). Cancelled events are left alone. Daily, like the
// other cron jobs (see event-reminders/route.ts on the Hobby plan limit).
async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();

  // Anything that could have ended by now: events that started in the past
  // (one-off ones, and recurring ones that may have a recurrence end date).
  // The precise check uses each church's own timezone below.
  const { data: events } = await admin
    .from("events")
    .select("id, start_at, end_at, is_recurring, recurrence_end_date, status, organizations(timezone)")
    .in("status", ["active", "pending"])
    .lte("start_at", now.toISOString());

  const toComplete: string[] = [];
  for (const event of events ?? []) {
    const timeZone = (event.organizations as { timezone: string } | null)?.timezone || DEFAULT_TIMEZONE;
    if (hasEventEnded(event, now, timeZone)) toComplete.push(event.id);
  }

  if (toComplete.length > 0) {
    await admin.from("events").update({ status: "completed" }).in("id", toComplete);
  }

  return NextResponse.json({ eventsChecked: events?.length ?? 0, markedCompleted: toComplete.length });
}

export const GET = withCronLogging("event-status", run);
