import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { withCronLogging } from "@/lib/cron/run-logger";
import { runRetention } from "@/lib/retention/run";

// Daily: reminds churches whose access has ended to resubscribe (every 7 days), warns
// them the day before, and deletes them after 30 days while the platform admin's
// switch is on. See src/lib/retention/run.ts.
async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;
  const summary = await runRetention();
  return NextResponse.json(summary);
}

export const GET = withCronLogging("subscription-retention", run);
