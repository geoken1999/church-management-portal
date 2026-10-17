import { NextResponse } from "next/server";
import { withCronLogging } from "@/lib/cron/run-logger";
import { sendDueClassReminders } from "@/lib/lms/reminders";

// Called every 5 minutes (by Supabase, see supabase/setup/lms-class-reminders-cron.sql) to remind
// students about Bible School live classes that are about to start. Guarded by CRON_SECRET.
export const maxDuration = 60;

async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendDueClassReminders(new Date()));
}

export const GET = withCronLogging("lms-class-reminders", run);
