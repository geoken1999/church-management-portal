import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { findSpecialDays, specialDayMessage } from "@/lib/push/special-days";
import { dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { withCronLogging } from "@/lib/cron/run-logger";

// Once a day: a birthday / wedding-anniversary push to each member who has the
// app, on their special day in their church's timezone. special_day_pushes
// (member, kind, year) stops a re-run from sending twice.
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

  const { data: organizations } = await admin.from("organizations").select("id, name, timezone");

  let sent = 0;
  let membersChecked = 0;
  let matches = 0;
  const problems: string[] = [];
  for (const organization of organizations ?? []) {
    const todayKey = dateKeyInTimezone(now, organization.timezone || DEFAULT_TIMEZONE);
    const year = Number(todayKey.slice(0, 4));

    const { data: members } = await admin
      .from("members")
      .select("id, first_name, auth_user_id, date_of_birth, wedding_date")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .not("auth_user_id", "is", null);

    membersChecked += (members ?? []).length;

    for (const { member, kind } of findSpecialDays(members ?? [], todayKey)) {
      // Claim it first; the primary key rejects a second send for the year.
      const { error } = await admin.from("special_day_pushes").insert({ member_id: member.id, kind, year });
      if (error) continue;
      matches += 1;

      const message = specialDayMessage(kind, member.first_name, organization.name);
      const result = await sendPushToUsers([member.auth_user_id as string], "special_day", { ...message, data: { type: "special_day", kind } });
      if (result.delivered > 0) {
        sent += 1;
      } else {
        // Nothing reached a device: release the claim so a later run can try again.
        await admin.from("special_day_pushes").delete().eq("member_id", member.id).eq("kind", kind).eq("year", year);
        problems.push(`${member.first_name}: ${result.skipped ?? "failed"}${result.error ? ` (${result.error})` : ""}`);
      }
    }
  }

  return NextResponse.json({ sent, membersChecked, matches, problems });
}

export const GET = withCronLogging("special-days", run);
