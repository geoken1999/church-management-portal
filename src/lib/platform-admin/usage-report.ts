import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/organizations/timezone";
import { PLANS, isPlanId } from "@/lib/plans/config";

// What each church has actually sent in a month, by channel and outcome. Read
// by the platform team to understand usage and to spot a church that's close
// to its limits or whose sends are failing.

export interface MonthWindow {
  month: string; // 'YYYY-MM' in the platform's timezone (Asia/Kolkata)
  startIso: string;
  endIso: string;
}

export function monthWindow(month: string): MonthWindow | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, mon] = month.split("-").map(Number);
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMonth = mon === 12 ? "01" : String(mon + 1).padStart(2, "0");
  return {
    month,
    startIso: zonedTimeToUtc(`${month}-01T00:00`, DEFAULT_TIMEZONE).toISOString(),
    endIso: zonedTimeToUtc(`${nextYear}-${nextMonth}-01T00:00`, DEFAULT_TIMEZONE).toISOString(),
  };
}

export interface ChannelTotals {
  sent: number;
  failed: number;
  campaigns: number;
}

export interface ChurchUsageRow {
  organizationId: string;
  organizationName: string;
  planName: string;
  email: ChannelTotals;
  sms: ChannelTotals;
  whatsapp: ChannelTotals;
  membershipEmails: number;
  automationMessages: number;
  aiReplies: number;
  // Delivery outcomes reported back by the providers, for the messages that
  // have a delivery record. Shown as counts per status.
  deliveryByStatus: Record<string, number>;
}

function emptyTotals(): ChannelTotals {
  return { sent: 0, failed: 0, campaigns: 0 };
}

function addCampaign(totals: ChannelTotals, sent: number, failed: number) {
  totals.sent += sent;
  totals.failed += failed;
  totals.campaigns += 1;
}

export async function getChurchUsageReport(window: MonthWindow): Promise<ChurchUsageRow[]> {
  const admin = createAdminClient();

  const [{ data: orgs }, { data: emails }, { data: sms }, { data: whatsapp }, { data: membership }, { data: automations }, { data: aiReplies }, { data: deliveries }] =
    await Promise.all([
      admin.from("organizations").select("id, name, plan"),
      admin.from("email_campaigns").select("organization_id, sent_count, failed_count").gte("created_at", window.startIso).lt("created_at", window.endIso),
      admin.from("sms_campaigns").select("organization_id, sent_count, failed_count").gte("created_at", window.startIso).lt("created_at", window.endIso),
      admin.from("whatsapp_campaigns").select("organization_id, sent_count, failed_count").gte("created_at", window.startIso).lt("created_at", window.endIso),
      admin
        .from("membership_fee_invoices")
        .select("organization_id, request_sent_at, reminder_sent_at, receipt_sent_at")
        .or(`request_sent_at.gte.${window.startIso},reminder_sent_at.gte.${window.startIso},receipt_sent_at.gte.${window.startIso}`),
      admin.from("automation_executions").select("organization_id, status, recipient_count").gte("sent_at", window.startIso).lt("sent_at", window.endIso),
      admin.from("ai_reply_usage").select("organization_id").gte("created_at", window.startIso).lt("created_at", window.endIso),
      admin.from("message_delivery_events").select("organization_id, status").gte("created_at", window.startIso).lt("created_at", window.endIso),
    ]);

  const rows = new Map<string, ChurchUsageRow>();
  for (const org of orgs ?? []) {
    rows.set(org.id, {
      organizationId: org.id,
      organizationName: org.name,
      planName: isPlanId(org.plan) ? PLANS[org.plan].name : org.plan,
      email: emptyTotals(),
      sms: emptyTotals(),
      whatsapp: emptyTotals(),
      membershipEmails: 0,
      automationMessages: 0,
      aiReplies: 0,
      deliveryByStatus: {},
    });
  }
  const row = (id: string) => rows.get(id);

  for (const c of emails ?? []) {
    const target = row(c.organization_id);
    if (target) addCampaign(target.email, c.sent_count, c.failed_count);
  }
  for (const c of sms ?? []) {
    const target = row(c.organization_id);
    if (target) addCampaign(target.sms, c.sent_count, c.failed_count);
  }
  for (const c of whatsapp ?? []) {
    const target = row(c.organization_id);
    if (target) addCampaign(target.whatsapp, c.sent_count, c.failed_count);
  }

  const inRange = (iso: string | null) => iso !== null && iso >= window.startIso && iso < window.endIso;
  for (const m of membership ?? []) {
    const target = row(m.organization_id);
    if (!target) continue;
    target.membershipEmails += [m.request_sent_at, m.reminder_sent_at, m.receipt_sent_at].filter(inRange).length;
  }
  for (const e of automations ?? []) {
    const target = row(e.organization_id);
    if (target && e.status === "sent") target.automationMessages += e.recipient_count;
  }
  for (const a of aiReplies ?? []) {
    const target = row(a.organization_id);
    if (target) target.aiReplies += 1;
  }
  for (const d of deliveries ?? []) {
    const target = d.organization_id ? row(d.organization_id) : undefined;
    if (target) target.deliveryByStatus[d.status] = (target.deliveryByStatus[d.status] ?? 0) + 1;
  }

  return [...rows.values()].sort((a, b) => totalSent(b) - totalSent(a));
}

export function totalSent(row: ChurchUsageRow): number {
  return row.email.sent + row.sms.sent + row.whatsapp.sent + row.membershipEmails + row.automationMessages + row.aiReplies;
}

export interface ChurchCampaignRow {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  date: string;
  label: string;
  recipients: number;
  sent: number;
  failed: number;
  status: string;
  via: string | null;
}

// One church's campaigns in the month, newest first.
export async function getChurchCampaigns(organizationId: string, window: MonthWindow): Promise<ChurchCampaignRow[]> {
  const admin = createAdminClient();
  const [{ data: emails }, { data: sms }, { data: whatsapp }] = await Promise.all([
    admin
      .from("email_campaigns")
      .select("id, subject, recipient_count, sent_count, failed_count, status, provider, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", window.startIso)
      .lt("created_at", window.endIso),
    admin
      .from("sms_campaigns")
      .select("id, body, recipient_count, sent_count, failed_count, status, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", window.startIso)
      .lt("created_at", window.endIso),
    admin
      .from("whatsapp_campaigns")
      .select("id, body, recipient_count, sent_count, failed_count, status, mode, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", window.startIso)
      .lt("created_at", window.endIso),
  ]);
  const rows: ChurchCampaignRow[] = [
    ...(emails ?? []).map((c) => ({ id: c.id, channel: "email" as const, date: c.created_at, label: c.subject, recipients: c.recipient_count, sent: c.sent_count, failed: c.failed_count, status: c.status, via: c.provider })),
    ...(sms ?? []).map((c) => ({ id: c.id, channel: "sms" as const, date: c.created_at, label: c.body.slice(0, 80), recipients: c.recipient_count, sent: c.sent_count, failed: c.failed_count, status: c.status, via: null })),
    ...(whatsapp ?? []).map((c) => ({ id: c.id, channel: "whatsapp" as const, date: c.created_at, label: c.body.slice(0, 80), recipients: c.recipient_count, sent: c.sent_count, failed: c.failed_count, status: c.status, via: c.mode })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
