import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCronLogging } from "@/lib/cron/run-logger";

// Keeps every church's Youth roster in line with its age rule. New members
// and edits are handled the moment they happen (a database trigger); this
// daily pass covers birthdays: someone turning into the range joins, someone
// passing out of it comes off (only if the rule added them).
async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data: organizations } = await admin.from("organizations").select("id").not("youth_age_from", "is", null).not("youth_age_to", "is", null);

  let added = 0;
  let removed = 0;
  for (const organization of organizations ?? []) {
    const { data } = await admin.rpc("sync_youth_for_org", { target_org_id: organization.id }).maybeSingle();
    added += data?.added ?? 0;
    removed += data?.removed ?? 0;
  }

  return NextResponse.json({ organizationsChecked: organizations?.length ?? 0, added, removed });
}

export const GET = withCronLogging("youth-sync", run);
