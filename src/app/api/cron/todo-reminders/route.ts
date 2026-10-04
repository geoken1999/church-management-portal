import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";

// A generous upper bound covering any timezone's "end of today," so the
// SQL filter below only needs to exclude todos nowhere near due yet — the
// precise per-org "due today or overdue" check happens in JS once each
// row's own org timezone is known (every org previously assumed
// Asia/Kolkata here).
const LOOKAHEAD_MS = 36 * 60 * 60 * 1000;

// Vercel Cron on the Hobby plan only allows daily (not sub-daily)
// schedules — see the long comment in event-reminders/route.ts. A once-a-
// day digest is a good fit for "due today or overdue" (unlike "1 hour
// before", there's no finer moment to aim for), sent once per to-do per
// org-local calendar day via last_reminder_sent_at.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: todos } = await admin
    .from("todos")
    .select("id, title, due_at, assigned_to, last_reminder_sent_at, organization_id, organizations(timezone)")
    .eq("status", "pending")
    .not("assigned_to", "is", null)
    .not("due_at", "is", null)
    .lte("due_at", new Date(now.getTime() + LOOKAHEAD_MS).toISOString());

  let remindersSent = 0;
  let todosChecked = 0;

  for (const todo of todos ?? []) {
    if (!todo.assigned_to || !todo.due_at) continue;
    todosChecked += 1;

    const organizationTimezone = (todo.organizations as { timezone: string } | null)?.timezone || DEFAULT_TIMEZONE;
    const todayKey = dateKeyInTimezone(now, organizationTimezone);
    const dueKey = dateKeyInTimezone(new Date(todo.due_at), organizationTimezone);
    const overdue = new Date(todo.due_at) < now;
    if (!overdue && dueKey !== todayKey) continue;

    if (todo.last_reminder_sent_at && dateKeyInTimezone(new Date(todo.last_reminder_sent_at), organizationTimezone) === todayKey) continue;

    await sendPushToUsers([todo.assigned_to], "todo_due_soon", {
      title: overdue ? "To-do overdue" : "To-do due today",
      body: todo.title,
      data: { type: "todo_due_soon" },
    });

    await admin.from("todos").update({ last_reminder_sent_at: now.toISOString() }).eq("id", todo.id);
    remindersSent += 1;
  }

  return NextResponse.json({ todosChecked, remindersSent });
}
