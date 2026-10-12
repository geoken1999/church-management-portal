import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { withCronLogging } from "@/lib/cron/run-logger";
import { reminderFor, reminderText } from "@/lib/todos/reminders";

// Looks far enough ahead to cover "due tomorrow" in any timezone; the precise
// per-church date checks happen in reminderFor.
const LOOKAHEAD_MS = 60 * 60 * 60 * 1000;

// Once a day (see vercel.json): each pending to-do with a due date can send a
// reminder the day before and/or on the due day (and each day it stays
// overdue), as the person who made it chose. It goes to whoever it's assigned
// to (a team login, or a leader with the app), or to its creator when nobody is.
// The sent-on dates keep it to once a day per kind.
async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();
  const dayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: todos } = await admin
    .from("todos")
    .select(
      "id, title, due_at, assigned_to, assigned_member_id, created_by, remind_day_before, remind_due_day, last_reminder_sent_at, day_before_sent_at, organization_id, organizations(timezone)",
    )
    .eq("status", "pending")
    .not("due_at", "is", null)
    .lte("due_at", new Date(now.getTime() + LOOKAHEAD_MS).toISOString());

  let remindersSent = 0;
  let todosChecked = 0;

  for (const todo of todos ?? []) {
    if (!todo.due_at) continue;
    todosChecked += 1;

    const timeZone = (todo.organizations as { timezone: string } | null)?.timezone || DEFAULT_TIMEZONE;
    const todayKey = dateKeyInTimezone(now, timeZone);
    const tomorrowKey = dateKeyInTimezone(dayLater, timeZone);

    const kind = reminderFor(
      {
        dueKey: dateKeyInTimezone(new Date(todo.due_at), timeZone),
        overdue: new Date(todo.due_at) < now,
        remindDayBefore: todo.remind_day_before,
        remindDueDay: todo.remind_due_day,
        lastDueReminderKey: todo.last_reminder_sent_at ? dateKeyInTimezone(new Date(todo.last_reminder_sent_at), timeZone) : null,
        lastDayBeforeKey: todo.day_before_sent_at ? dateKeyInTimezone(new Date(todo.day_before_sent_at), timeZone) : null,
      },
      todayKey,
      tomorrowKey,
    );
    if (!kind) continue;

    // A team login, a leader's own app login, or (nobody assigned) whoever made it.
    let recipient = todo.assigned_to;
    if (!recipient && todo.assigned_member_id) {
      const { data: leader } = await admin.from("members").select("auth_user_id").eq("id", todo.assigned_member_id).maybeSingle();
      recipient = leader?.auth_user_id ?? null;
    }
    if (!recipient && !todo.assigned_to && !todo.assigned_member_id) recipient = todo.created_by;
    if (!recipient) continue;

    await sendPushToUsers([recipient], "todo_due_soon", {
      title: reminderText(kind),
      body: todo.title,
      data: { type: "todo_due_soon" },
    });

    await admin
      .from("todos")
      .update(kind === "day_before" ? { day_before_sent_at: now.toISOString() } : { last_reminder_sent_at: now.toISOString() })
      .eq("id", todo.id);
    remindersSent += 1;
  }

  return NextResponse.json({ todosChecked, remindersSent });
}

export const GET = withCronLogging("todo-reminders", run);
