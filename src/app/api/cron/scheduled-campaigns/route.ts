import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCronLogging } from "@/lib/cron/run-logger";
import { runDueCampaigns } from "@/lib/scheduler/run";

// Called every 5 minutes by Vercel (vercel.json). The Supabase job in supabase/setup/scheduled-campaigns-cron.sql
// also works and is safe to run alongside it: a campaign is claimed before it is sent, so it never goes out twice.
// Sends the email, SMS, WhatsApp and push campaigns that have come due. Guarded by CRON_SECRET like the
// other cron routes.
export const maxDuration = 60;

async function run(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;
  const result = await runDueCampaigns(createAdminClient(), new Date());
  return NextResponse.json(result);
}

export const GET = withCronLogging("scheduled-campaigns", run);
