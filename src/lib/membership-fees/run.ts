import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { financeEnabledForBackground, getSharedEmailRemainingForBackground } from "@/lib/plans/dal";
import { sendMembershipEmail } from "@/lib/membership-fees/email";
import { isMembershipDueDay, membershipPaymentPath, membershipPeriodFor, membershipPeriodLabel } from "@/lib/membership-fees/config";

type Admin = ReturnType<typeof createAdminClient>;

// Sends per organization per daily run. A larger backlog carries over to the
// next day's run, so one big church can't hold up the others.
const SEND_LIMIT_PER_ORG_PER_RUN = 300;
const CHUNK = 500;

export interface MembershipFeeCycleResult {
  orgsChecked: number;
  membersBilled: number;
  requestsSent: number;
  remindersSent: number;
  failed: number;
}

interface PendingRow {
  id: string;
  amount: number;
  public_token: string;
  members: { first_name: string; email: string | null } | { first_name: string; email: string | null }[] | null;
}

// Runs once a day from the existing automation cron. It does work only for
// organizations that have the fee switched on and whose due day is today (in
// their own timezone), and it can safely run again: invoices are unique per
// member per month, and a sent email is recorded so it isn't sent twice.
export async function runMembershipFeeCycle(admin: Admin, now: Date): Promise<MembershipFeeCycleResult> {
  const result: MembershipFeeCycleResult = { orgsChecked: 0, membersBilled: 0, requestsSent: 0, remindersSent: 0, failed: 0 };

  const { data: settingsRows } = await admin
    .from("membership_fee_settings")
    .select("organization_id, amount, due_day, reminder_after_days")
    .eq("enabled", true);

  for (const settings of settingsRows ?? []) {
    if (settings.amount === null) continue;
    try {
      const { data: org } = await admin.from("organizations").select("id, name, timezone").eq("id", settings.organization_id).maybeSingle();
      if (!org) continue;
      if (!(await financeEnabledForBackground(org.id))) continue;
      result.orgsChecked++;

      const period = membershipPeriodFor(now, org.timezone);
      if (isMembershipDueDay(now, org.timezone, settings.due_day)) {
        result.membersBilled += await createInvoicesForPeriod(admin, org.id, period, Number(settings.amount));
      }

      const { data: ownSmtp } = await admin.from("email_smtp_settings").select("organization_id").eq("organization_id", org.id).maybeSingle();
      const budget = { remaining: ownSmtp ? Number.POSITIVE_INFINITY : await getSharedEmailRemainingForBackground(org.id) };

      const sent = await sendRequests(admin, org, period, budget, result);
      result.requestsSent += sent;
      result.remindersSent += await sendReminders(admin, org, period, Number(settings.reminder_after_days), now, budget, result);
    } catch (err) {
      result.failed++;
      await logPlatformEvent({
        level: "error",
        source: "membership_fee",
        message: `Membership fee run failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: settings.organization_id,
      });
    }
  }

  return result;
}

// One invoice per active member for the period. Re-running is a no-op for
// members who already have one.
async function createInvoicesForPeriod(admin: Admin, organizationId: string, period: string, amount: number): Promise<number> {
  const { data: members } = await admin.from("members").select("id").eq("organization_id", organizationId).eq("status", "active");
  const rows = (members ?? []).map((m) => ({ organization_id: organizationId, member_id: m.id, period, amount, status: "due" as const }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("membership_fee_invoices")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "organization_id,member_id,period", ignoreDuplicates: true });
    if (error) throw new Error(`Couldn't create membership invoices: ${error.message}`);
  }
  return rows.length;
}

async function sendRequests(
  admin: Admin,
  org: { id: string; name: string; timezone: string },
  period: string,
  budget: { remaining: number },
  result: MembershipFeeCycleResult,
): Promise<number> {
  const { data } = await admin
    .from("membership_fee_invoices")
    .select("id, amount, public_token, members!inner(first_name, email)")
    .eq("organization_id", org.id)
    .eq("period", period)
    .eq("status", "due")
    .is("request_sent_at", null)
    .not("members.email", "is", null)
    .limit(SEND_LIMIT_PER_ORG_PER_RUN);

  let sent = 0;
  for (const row of (data ?? []) as unknown as PendingRow[]) {
    if (budget.remaining <= 0) break;
    const member = Array.isArray(row.members) ? row.members[0] : row.members;
    if (!member?.email) continue;

    const outcome = await deliver(admin, org, {
      invoiceId: row.id,
      to: member.email,
      firstName: member.first_name,
      amount: Number(row.amount),
      period,
      token: row.public_token,
      kind: "request",
    });
    if (outcome) {
      budget.remaining--;
      sent++;
    } else {
      result.failed++;
    }
  }
  return sent;
}

async function sendReminders(
  admin: Admin,
  org: { id: string; name: string; timezone: string },
  period: string,
  reminderAfterDays: number,
  now: Date,
  budget: { remaining: number },
  result: MembershipFeeCycleResult,
): Promise<number> {
  const cutoff = new Date(now.getTime() - reminderAfterDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("membership_fee_invoices")
    .select("id, amount, public_token, members!inner(first_name, email)")
    .eq("organization_id", org.id)
    .eq("period", period)
    .eq("status", "due")
    .not("request_sent_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("request_sent_at", cutoff)
    .not("members.email", "is", null)
    .limit(SEND_LIMIT_PER_ORG_PER_RUN);

  let sent = 0;
  for (const row of (data ?? []) as unknown as PendingRow[]) {
    if (budget.remaining <= 0) break;
    const member = Array.isArray(row.members) ? row.members[0] : row.members;
    if (!member?.email) continue;

    const outcome = await deliver(admin, org, {
      invoiceId: row.id,
      to: member.email,
      firstName: member.first_name,
      amount: Number(row.amount),
      period,
      token: row.public_token,
      kind: "reminder",
    });
    if (outcome) {
      budget.remaining--;
      sent++;
    } else {
      result.failed++;
    }
  }
  return sent;
}

// Sends one message and records it. Returns false if it didn't go out, so the
// invoice stays eligible for the next run.
async function deliver(
  admin: Admin,
  org: { id: string; name: string },
  item: { invoiceId: string; to: string; firstName: string; amount: number; period: string; token: string; kind: "request" | "reminder" },
): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    await logPlatformEvent({
      level: "error",
      source: "membership_fee",
      message: "NEXT_PUBLIC_SITE_URL isn't set, so membership payment links can't be built",
      organizationId: org.id,
    });
    return false;
  }

  const link = `${siteUrl}${membershipPaymentPath(item.token)}`;
  const periodLabel = membershipPeriodLabel(item.period);
  const amountText = `₹${item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const subject =
    item.kind === "request" ? `Membership fee for ${periodLabel}` : `Reminder: membership fee for ${periodLabel}`;
  const intro =
    item.kind === "request"
      ? `Your monthly membership fee for ${periodLabel} is <strong>${amountText}</strong>.`
      : `This is a reminder that your monthly membership fee for ${periodLabel} (<strong>${amountText}</strong>) is still outstanding.`;
  const html = `<p>Dear ${escapeHtml(item.firstName)},</p><p>${intro}</p><p><a href="${link}">Pay the membership fee</a></p><p>Thank you,<br/>${escapeHtml(org.name)}</p>`;

  const sent = await sendMembershipEmail({ organizationId: org.id, organizationName: org.name, to: item.to, subject, html });
  if (!sent.ok) {
    await logPlatformEvent({
      level: "warning",
      source: "membership_fee",
      message: `Membership fee ${item.kind} not sent: ${sent.error}`,
      organizationId: org.id,
    });
    return false;
  }

  const now = new Date().toISOString();
  if (item.kind === "request") {
    await admin.from("membership_fee_invoices").update({ request_sent_at: now, request_via: sent.via }).eq("id", item.invoiceId);
  } else {
    await admin.from("membership_fee_invoices").update({ reminder_sent_at: now, reminder_via: sent.via }).eq("id", item.invoiceId);
  }
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
