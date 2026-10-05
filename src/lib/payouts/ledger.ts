import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sharedServiceFee, sharedServiceNetAmount } from "@/lib/finance/fees";
import { membershipPeriodLabel } from "@/lib/membership-fees/config";
import type { TabKey } from "@/lib/permissions/tabs";

// One place for everything an organization collects through KingdomFlow's
// shared account and is paid out for: Fund Raisers, paid events and
// membership fees. Each stream keeps its own balances, requests and payouts,
// because the platform wires each one separately. The fee is the same 2.5% in
// every stream.

export type PayoutStream = "fundraisers" | "events" | "membership";

export const PAYOUT_STREAMS: { key: PayoutStream; label: string; tab: TabKey }[] = [
  { key: "fundraisers", label: "Fund Raisers", tab: "fundraisers" },
  { key: "events", label: "Paid events", tab: "events" },
  { key: "membership", label: "Membership fees", tab: "donations" },
];

export const STREAM_LABEL: Record<PayoutStream, string> = {
  fundraisers: "Fund Raisers",
  events: "Paid events",
  membership: "Membership fees",
};

export interface PayoutSourceBalance {
  stream: PayoutStream;
  // The Fund Raiser or event this balance belongs to. Null for membership fees,
  // which are one balance for the whole organization.
  sourceId: string | null;
  source: string;
  collected: number;
  fee: number;
  net: number;
  paidOut: number;
  owed: number;
  pendingRequestId: string | null;
  pendingAmount: number | null;
}

export interface PayoutCollection {
  id: string;
  stream: PayoutStream;
  source: string;
  date: string;
  gross: number;
  fee: number;
  net: number;
}

export interface PayoutTransaction {
  id: string;
  stream: PayoutStream;
  source: string;
  date: string;
  amount: number;
  note: string | null;
}

export interface PayoutRequestRow {
  id: string;
  stream: PayoutStream;
  source: string;
  date: string;
  amount: number;
  status: string;
}

export interface OrganizationPayoutLedger {
  totals: { collected: number; fee: number; net: number; paidOut: number; owed: number };
  balances: PayoutSourceBalance[];
  collections: PayoutCollection[];
  transactions: PayoutTransaction[];
  requests: PayoutRequestRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string) => iso.slice(0, 10);

function balanceRow(
  stream: PayoutStream,
  sourceId: string | null,
  source: string,
  collected: number,
  paidOut: number,
  pending: { id: string; amount: number } | null,
): PayoutSourceBalance {
  const fee = sharedServiceFee(collected);
  const net = sharedServiceNetAmount(collected);
  return {
    stream,
    sourceId,
    source,
    collected: round2(collected),
    fee: round2(fee),
    net: round2(net),
    paidOut: round2(paidOut),
    owed: round2(net - paidOut),
    pendingRequestId: pending?.id ?? null,
    pendingAmount: pending ? round2(pending.amount) : null,
  };
}

export async function getOrganizationPayoutLedger(organizationId: string, streams: PayoutStream[]): Promise<OrganizationPayoutLedger> {
  const admin = createAdminClient();
  const wanted = new Set(streams);
  const balances: PayoutSourceBalance[] = [];
  const collections: PayoutCollection[] = [];
  const transactions: PayoutTransaction[] = [];
  const requests: PayoutRequestRow[] = [];

  if (wanted.has("fundraisers")) {
    const [{ data: fundraisers }, { data: donations }, { data: payouts }, { data: reqs }] = await Promise.all([
      admin.from("fundraisers").select("id, title").eq("organization_id", organizationId),
      admin.from("donations").select("id, fundraiser_id, amount, donated_on").eq("organization_id", organizationId).eq("payment_mode", "shared").not("fundraiser_id", "is", null),
      admin.from("fundraiser_payouts").select("id, fundraiser_id, amount, note, created_at").eq("organization_id", organizationId),
      admin.from("fundraiser_payout_requests").select("id, fundraiser_id, amount, status, created_at").eq("organization_id", organizationId),
    ]);
    const title = new Map((fundraisers ?? []).map((f) => [f.id, f.title]));
    const name = (id: string | null) => (id && title.get(id)) || "Fund Raiser";

    for (const d of donations ?? []) {
      const gross = Number(d.amount);
      collections.push({ id: d.id, stream: "fundraisers", source: name(d.fundraiser_id), date: d.donated_on, gross: round2(gross), fee: round2(sharedServiceFee(gross)), net: round2(sharedServiceNetAmount(gross)) });
    }
    for (const p of payouts ?? []) {
      transactions.push({ id: p.id, stream: "fundraisers", source: name(p.fundraiser_id), date: dayOf(p.created_at), amount: Number(p.amount), note: p.note });
    }
    for (const r of reqs ?? []) {
      requests.push({ id: r.id, stream: "fundraisers", source: name(r.fundraiser_id), date: dayOf(r.created_at), amount: Number(r.amount), status: r.status });
    }
    for (const f of fundraisers ?? []) {
      const collected = (donations ?? []).filter((d) => d.fundraiser_id === f.id).reduce((s, d) => s + Number(d.amount), 0);
      const paidOut = (payouts ?? []).filter((p) => p.fundraiser_id === f.id).reduce((s, p) => s + Number(p.amount), 0);
      const pending = (reqs ?? []).find((r) => r.fundraiser_id === f.id && r.status === "pending");
      if (collected > 0 || paidOut > 0) {
        balances.push(balanceRow("fundraisers", f.id, f.title, collected, paidOut, pending ? { id: pending.id, amount: Number(pending.amount) } : null));
      }
    }
  }

  if (wanted.has("events")) {
    const [{ data: events }, { data: orders }, { data: payouts }, { data: reqs }] = await Promise.all([
      admin.from("events").select("id, title").eq("organization_id", organizationId),
      admin.from("event_registration_payment_orders").select("id, event_id, amount, updated_at").eq("organization_id", organizationId).eq("status", "paid"),
      admin.from("event_payouts").select("id, event_id, amount, note, created_at").eq("organization_id", organizationId),
      admin.from("event_payout_requests").select("id, event_id, amount, status, created_at").eq("organization_id", organizationId),
    ]);
    const title = new Map((events ?? []).map((e) => [e.id, e.title]));
    const name = (id: string) => title.get(id) ?? "Paid event";

    for (const o of orders ?? []) {
      const gross = Number(o.amount);
      collections.push({ id: o.id, stream: "events", source: name(o.event_id), date: dayOf(o.updated_at), gross: round2(gross), fee: round2(sharedServiceFee(gross)), net: round2(sharedServiceNetAmount(gross)) });
    }
    for (const p of payouts ?? []) {
      transactions.push({ id: p.id, stream: "events", source: name(p.event_id), date: dayOf(p.created_at), amount: Number(p.amount), note: p.note });
    }
    for (const r of reqs ?? []) {
      requests.push({ id: r.id, stream: "events", source: name(r.event_id), date: dayOf(r.created_at), amount: Number(r.amount), status: r.status });
    }
    for (const e of events ?? []) {
      const collected = (orders ?? []).filter((o) => o.event_id === e.id).reduce((s, o) => s + Number(o.amount), 0);
      const paidOut = (payouts ?? []).filter((p) => p.event_id === e.id).reduce((s, p) => s + Number(p.amount), 0);
      const pending = (reqs ?? []).find((r) => r.event_id === e.id && r.status === "pending");
      if (collected > 0 || paidOut > 0) {
        balances.push(balanceRow("events", e.id, e.title, collected, paidOut, pending ? { id: pending.id, amount: Number(pending.amount) } : null));
      }
    }
  }

  if (wanted.has("membership")) {
    const [{ data: invoices }, { data: payouts }, { data: reqs }] = await Promise.all([
      admin.from("membership_fee_invoices").select("id, amount, period, paid_at").eq("organization_id", organizationId).eq("status", "paid"),
      admin.from("membership_payouts").select("id, amount, note, created_at").eq("organization_id", organizationId),
      admin.from("membership_payout_requests").select("id, amount, status, created_at").eq("organization_id", organizationId),
    ]);
    const label = "Membership fees";
    for (const i of invoices ?? []) {
      const gross = Number(i.amount);
      collections.push({ id: i.id, stream: "membership", source: `${label}, ${membershipPeriodLabel(i.period)}`, date: dayOf(i.paid_at ?? new Date().toISOString()), gross: round2(gross), fee: round2(sharedServiceFee(gross)), net: round2(sharedServiceNetAmount(gross)) });
    }
    for (const p of payouts ?? []) {
      transactions.push({ id: p.id, stream: "membership", source: label, date: dayOf(p.created_at), amount: Number(p.amount), note: p.note });
    }
    for (const r of reqs ?? []) {
      requests.push({ id: r.id, stream: "membership", source: label, date: dayOf(r.created_at), amount: Number(r.amount), status: r.status });
    }
    const collected = (invoices ?? []).reduce((s, i) => s + Number(i.amount), 0);
    const paidOut = (payouts ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const pending = (reqs ?? []).find((r) => r.status === "pending");
    if (collected > 0 || paidOut > 0) {
      balances.push(balanceRow("membership", null, label, collected, paidOut, pending ? { id: pending.id, amount: Number(pending.amount) } : null));
    }
  }

  collections.sort((a, b) => b.date.localeCompare(a.date));
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  requests.sort((a, b) => b.date.localeCompare(a.date));

  const sum = (f: (b: PayoutSourceBalance) => number) => round2(balances.reduce((s, b) => s + f(b), 0));
  return {
    totals: { collected: sum((b) => b.collected), fee: sum((b) => b.fee), net: sum((b) => b.net), paidOut: sum((b) => b.paidOut), owed: sum((b) => Math.max(0, b.owed)) },
    balances,
    collections,
    transactions,
    requests,
  };
}
