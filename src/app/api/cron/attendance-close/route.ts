import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE, partsInTimezone } from "@/lib/organizations/timezone";
import { withCronLogging } from "@/lib/cron/run-logger";

const pad = (n: number) => String(n).padStart(2, "0");

// Closes attendance registers nobody marked "complete". Once a service's day is over in the church's own time zone,
// a register with people marked (or a headcount) is marked complete, so reports and the follow-up automation can
// use it. A register with nothing in it is left open: closing an empty one would read as "everyone was absent".
async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();
  // A day ahead of UTC covers every time zone; the exact test per church is below.
  const horizon = new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);

  const { data: sessions } = await admin
    .from("attendance_sessions")
    .select("id, occurrence_date, headcount, organizations(timezone)")
    .is("recorded_at", null)
    .lte("occurrence_date", horizon)
    .limit(1000);

  const over = (sessions ?? []).filter((s) => {
    const p = partsInTimezone(now, (s.organizations as { timezone: string } | null)?.timezone || DEFAULT_TIMEZONE);
    return s.occurrence_date < `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  });

  const withMarks = new Set<string>();
  for (let i = 0; i < over.length; i += 200) {
    const { data: records } = await admin.from("attendance_records").select("session_id").in("session_id", over.slice(i, i + 200).map((s) => s.id)).limit(5000);
    for (const r of records ?? []) withMarks.add(r.session_id);
  }

  const toClose = over.filter((s) => withMarks.has(s.id) || (s.headcount ?? 0) > 0).map((s) => s.id);
  if (toClose.length > 0) await admin.from("attendance_sessions").update({ recorded_at: now.toISOString() }).in("id", toClose).is("recorded_at", null);

  return NextResponse.json({ openPastSessions: over.length, closed: toClose.length, leftOpenEmpty: over.length - toClose.length });
}

export const GET = withCronLogging("attendance-close", run);
