import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCronLogging } from "@/lib/cron/run-logger";
import { runDueCampaigns } from "@/lib/scheduler/run";

// Called every 5 minutes (by Supabase, see supabase/setup/scheduled-campaigns-cron.sql) to send
// the email, SMS and WhatsApp campaigns that have come due. Guarded by CRON_SECRET like the
// other cron routes.
export const maxDuration = 60;

async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;
  const result = await runDueCampaigns(createAdminClient(), new Date());
  return NextResponse.json(result);
}

export const GET = withCronLogging("scheduled-campaigns", run);
