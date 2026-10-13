import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { accessEndedAt, deletionDate, nextAction } from "@/lib/retention/rules";
import { getRetentionRecipients, sendRetentionEmail } from "@/lib/retention/emails";
import { amountOwedToChurch, purgeOrganization } from "@/lib/retention/purge";
import { isAutoDeleteOn } from "@/lib/retention/settings";

// At most this many churches are deleted in one run, so a mistake can never take
// out many churches at once.
const MAX_DELETIONS_PER_RUN = 3;

export interface RetentionRunSummary {
  ok: boolean;
  autoDelete: boolean;
  checked: number;
  started: number;
  reminders: number;
  finalWarnings: number;
  deleted: number;
  wouldDelete: number;
  blockedOwed: number;
  blockedNoContact: number;
  exempt: number;
  resubscribed: number;
  deferred: number;
}

/**
 * The daily job behind "reminders, then deletion" for churches that have lost access:
 * a reminder to resubscribe every 7 days, a final warning the day before, and, only
 * while the platform admin's switch is on, deletion after 30 days. See rules.ts.
 *
 * Nothing is deleted unless the church was sent a final warning at least a day
 * earlier, still has no access, is not marked to keep, and is not owed money.
 */
export async function runRetention(now = new Date()): Promise<RetentionRunSummary> {
  const admin = createAdminClient();
  const autoDelete = await isAutoDeleteOn();
  const summary: RetentionRunSummary = { ok: true, autoDelete, checked: 0, started: 0, reminders: 0, finalWarnings: 0, deleted: 0, wouldDelete: 0, blockedOwed: 0, blockedNoContact: 0, exempt: 0, resubscribed: 0, deferred: 0 };

  const [{ data: orgs }, { data: retentionRows }] = await Promise.all([
    admin.from("organizations").select("id, name, trial_ends_at").lt("trial_ends_at", now.toISOString()).limit(5000),
    admin.from("organization_retention").select("*"),
  ]);
  const ids = (orgs ?? []).map((o) => o.id);
  const { data: subscriptions } = ids.length
    ? await admin.from("organization_subscriptions").select("organization_id, status, current_end, updated_at").in("organization_id", ids)
    : { data: [] };
  const subscriptionByOrg = new Map((subscriptions ?? []).map((s) => [s.organization_id, s]));
  const retentionByOrg = new Map((retentionRows ?? []).map((r) => [r.organization_id, r]));

  const orgIdsStillListed = new Set<string>();
  for (const org of orgs ?? []) {
    summary.checked += 1;
    const subscription = subscriptionByOrg.get(org.id) ?? null;
    const endedAt = accessEndedAt(org.trial_ends_at ? new Date(org.trial_ends_at) : null, subscription, now);
    let row = retentionByOrg.get(org.id);

    if (!endedAt) {
      // Subscribed again (or still has access): the countdown stops.
      if (row) {
        await admin.from("organization_retention").delete().eq("organization_id", org.id);
        summary.resubscribed += 1;
      }
      continue;
    }
    orgIdsStillListed.add(org.id);

    if (!row) {
      // The countdown starts when we first notice, so a church that lapsed long ago
      // still gets its full notice before anything happens.
      const { data: created } = await admin.from("organization_retention").insert({ organization_id: org.id, expired_since: now.toISOString() }).select("*").single();
      if (!created) continue;
      row = created;
      summary.started += 1;
    }
    if (row.exempt) {
      summary.exempt += 1;
      continue;
    }

    const expiredSince = new Date(row.expired_since);
    const action = nextAction({ expiredSince, remindersSent: row.reminders_sent, finalWarningSentAt: row.final_warning_sent_at ? new Date(row.final_warning_sent_at) : null }, now);
    const deleteOn = deletionDate(expiredSince);

    if (action === "reminder" || action === "final_warning") {
      const sent = await sendRetentionEmail({ organizationId: org.id, churchName: org.name, deleteOn, kind: action === "final_warning" ? "final" : "reminder" });
      if (!sent) {
        // Nobody could be told. A final warning that can't be sent means no deletion.
        if (action === "final_warning") {
          summary.blockedNoContact += 1;
          await admin.from("organization_retention").update({ blocked_reason: "no_contact_email", updated_at: now.toISOString() }).eq("organization_id", org.id);
        }
        continue;
      }
      if (action === "reminder") {
        summary.reminders += 1;
        await admin.from("organization_retention").update({ reminders_sent: row.reminders_sent + 1, last_reminder_at: now.toISOString(), blocked_reason: null, updated_at: now.toISOString() }).eq("organization_id", org.id);
      } else {
        summary.finalWarnings += 1;
        await admin.from("organization_retention").update({ final_warning_sent_at: now.toISOString(), blocked_reason: null, updated_at: now.toISOString() }).eq("organization_id", org.id);
      }
      continue;
    }

    if (action !== "delete") continue;

    if (!autoDelete) {
      summary.wouldDelete += 1;
      continue;
    }
    if (summary.deleted >= MAX_DELETIONS_PER_RUN) {
      summary.deferred += 1;
      continue;
    }

    // Last checks, against fresh data, right before the one thing that can't be undone.
    const { data: freshSubscription } = await admin.from("organization_subscriptions").select("status").eq("organization_id", org.id).maybeSingle();
    if (freshSubscription?.status === "active") continue;
    const owed = await amountOwedToChurch(org.id);
    if (owed > 0) {
      summary.blockedOwed += 1;
      await admin.from("organization_retention").update({ blocked_reason: "owed_money", updated_at: now.toISOString() }).eq("organization_id", org.id);
      await logPlatformEvent({
        level: "warning",
        source: "platform_admin",
        message: `${org.name} is due for deletion but is still owed ₹${owed.toFixed(2)}; skipped until it is settled`,
        organizationId: org.id,
      });
      continue;
    }

    const recipients = await getRetentionRecipients(org.id);
    const result = await purgeOrganization(org.id);
    if (!result.ok) {
      summary.ok = false;
      await logPlatformEvent({ level: "error", source: "platform_admin", message: `Deleting ${org.name} failed: ${result.error}`, organizationId: org.id });
      continue;
    }
    summary.deleted += 1;
    await admin.from("deleted_organizations").insert({
      organization_id: org.id,
      name: org.name,
      owner_email: recipients[0] ?? null,
      expired_since: row.expired_since,
      summary: result.summary,
    });
    await logPlatformEvent({ level: "info", source: "platform_admin", message: `${org.name} was deleted after its access ended (${result.summary.files} files, ${result.summary.usersDeleted} logins)` });
  }

  // A church that no longer shows as lapsed at all (e.g. its trial was extended).
  for (const row of retentionRows ?? []) {
    if (!orgIdsStillListed.has(row.organization_id) && !(orgs ?? []).some((o) => o.id === row.organization_id)) {
      await admin.from("organization_retention").delete().eq("organization_id", row.organization_id);
      summary.resubscribed += 1;
    }
  }

  return summary;
}
