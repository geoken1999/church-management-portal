import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";

// Same "IST calendar day" convention as src/app/api/cron/event-reminders —
// same product, same target org base, and it keeps "due today" meaning
// the same thing in both places.
function istDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The UTC instant for 23:59:59.999 on [date]'s IST calendar day — lets the
// query below catch a to-do due later *today* (IST), not just ones already
// overdue at the moment the cron happens to run.
function istEndOfDayUtc(date: Date): Date {
  const [y, m, d] = istDateKey(date).split("-").map(Number);
  const startOfNextDayIstAsUtcMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - IST_OFFSET_MS;
  return new Date(startOfNextDayIstAsUtcMs - 1);
}

// Vercel Cron on the Hobby plan only allows daily (not sub-daily)
// schedules — see the long comment in event-reminders/route.ts. A once-a-
// day digest is a good fit for "due today or overdue" (unlike "1 hour
// before", there's no finer moment to aim for), sent once per to-do per
// IST calendar day via last_reminder_sent_at.
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
  const todayKey = istDateKey(now);

  const { data: todos } = await admin
    .from("todos")
    .select("id, title, due_at, assigned_to, last_reminder_sent_at")
    .eq("status", "pending")
    .not("assigned_to", "is", null)
    .not("due_at", "is", null)
    .lte("due_at", istEndOfDayUtc(now).toISOString());

  let remindersSent = 0;

  for (const todo of todos ?? []) {
    if (!todo.assigned_to || !todo.due_at) continue;
    if (todo.last_reminder_sent_at && istDateKey(new Date(todo.last_reminder_sent_at)) === todayKey) continue;

    const overdue = new Date(todo.due_at) < now;

    await sendPushToUsers([todo.assigned_to], "todo_due_soon", {
      title: overdue ? "To-do overdue" : "To-do due today",
      body: todo.title,
      data: { type: "todo_due_soon" },
    });

    await admin.from("todos").update({ last_reminder_sent_at: now.toISOString() }).eq("id", todo.id);
    remindersSent += 1;
  }

  return NextResponse.json({ todosChecked: (todos ?? []).length, remindersSent });
}
