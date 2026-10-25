import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { withCronLogging } from "@/lib/cron/run-logger";
import { runDueCustomReports } from "@/lib/reports/custom-service";

// Emails the custom reports churches have scheduled (daily, weekly or monthly). A report is never sent twice in
// one day, so running this again is safe.
async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;
  return NextResponse.json(await runDueCustomReports());
}

export const GET = withCronLogging("custom-reports", run);
