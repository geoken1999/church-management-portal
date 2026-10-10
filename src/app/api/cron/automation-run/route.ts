import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findEligibleMembersForTrigger } from "@/lib/automations/eligibility";
import { sendDirectMemberMessage, sendStaffDigest } from "@/lib/automations/send";
import { runMemberFollowupAutomations } from "@/lib/automations/followup-run";
import { runMembershipFeeCycle } from "@/lib/membership-fees/run";
import type { AutomationTrigger } from "@/types/database";
import { withCronLogging } from "@/lib/cron/run-logger";

// Vercel Cron hits this once a day (see vercel.json) — no user session
// exists on a cron-triggered request, so this checks CRON_SECRET, the
// same pattern as src/app/api/cron/event-reminders/route.ts.
//
// One route scanning every org's active triggers in a single pass, not a
// route per org — matches the only precedent in this codebase
// (event-reminders/todo-reminders/daily-health-report all do this), and a
// per-org route isn't workable anyway since Vercel Cron config is static
// at deploy time while orgs are created dynamically.
//
// Every send below is strictly sequential (no Promise.all), matching
// sendBulkTemplateMessage's own sequential loop, to avoid bursting Meta's
// per-number rate limits.
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

  const { data: triggers } = await admin
    .from("automation_triggers")
    .select("*, automations!inner(id, organization_id, status, organizations(name))")
    .eq("is_active", true)
    .eq("automations.status", "active");

  let membersMessaged = 0;
  const digestBuckets = new Map<string, { name: string; occasionLabel: string }[]>();
  const orgNameByAutomation = new Map<string, string>();

  for (const row of triggers ?? []) {
    const automation = row.automations as unknown as { id: string; organization_id: string; status: string; organizations: { name: string } | null };
    const trigger = row as unknown as AutomationTrigger;
    const organizationName = automation.organizations?.name ?? "Your church";
    orgNameByAutomation.set(trigger.automation_id, organizationName);

    const eligible = await findEligibleMembersForTrigger(admin, trigger, now);

    for (const { member, occasionLabel, occurrenceYear } of eligible) {
      await sendDirectMemberMessage(admin, trigger, member, occasionLabel, occurrenceYear, organizationName);
      membersMessaged += 1;

      const bucket = digestBuckets.get(trigger.automation_id) ?? [];
      bucket.push({ name: `${member.first_name} ${member.last_name}`, occasionLabel });
      digestBuckets.set(trigger.automation_id, bucket);
    }
  }

  const { data: digestDestinations } = await admin
    .from("automation_destinations")
    .select("*")
    .eq("kind", "staff_digest")
    .eq("is_active", true);

  let digestsSent = 0;
  for (const destination of digestDestinations ?? []) {
    const celebrants = digestBuckets.get(destination.automation_id) ?? [];
    if (celebrants.length === 0) continue;
    const sent = await sendStaffDigest(admin, destination.automation_id, destination.organization_id, destination, celebrants, now);
    if (sent) digestsSent += 1;
  }

  // Member follow-up is a separate pass: it creates tasks, not messages, and
  // each run is idempotent per automation per local day (see followup-run.ts).
  const followups = await runMemberFollowupAutomations(admin, now);

  // Monthly membership fee requests and reminders. Same daily run, and
  // it does nothing for orgs whose due day isn't today (see run.ts).
  const membershipFees = await runMembershipFeeCycle(admin, now);

  return NextResponse.json({
    triggersChecked: triggers?.length ?? 0,
    membersMessaged,
    digestsSent,
    followupAutomationsChecked: followups.automationsChecked,
    membershipFeeOrgsChecked: membershipFees.orgsChecked,
    membershipFeeRequestsSent: membershipFees.requestsSent,
    membershipFeeRemindersSent: membershipFees.remindersSent,
  });
}

export const GET = withCronLogging("automation-run", run);
