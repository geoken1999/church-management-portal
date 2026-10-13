import { NextResponse } from "next/server";
import { withCronLogging } from "@/lib/cron/run-logger";
import { runRetention } from "@/lib/retention/run";

// Daily: reminds churches whose access has ended to resubscribe (every 7 days), warns
// them the day before, and deletes them after 30 days while the platform admin's
// switch is on. See src/lib/retention/run.ts.
async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runRetention();
  return NextResponse.json(summary);
}

export const GET = withCronLogging("subscription-retention", run);
