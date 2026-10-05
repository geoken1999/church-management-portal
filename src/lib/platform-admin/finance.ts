import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sharedServiceFee } from "@/lib/finance/fees";
import { DEFAULT_TIMEZONE, dateKeyInTimezone } from "@/lib/organizations/timezone";
import { PLATFORM_SERVICES, monthKeyOfDate, platformServiceLabel, recentMonthKeys } from "@/lib/platform-admin/finance-config";
import type { PlatformExpense } from "@/types/database";

// Money KingdomFlow itself keeps. Revenue is the platform's share only:
// subscriptions and add-on packs in full, and the shared-account fee on
// fundraiser and event payments. The gross collected on shared accounts
// belongs to churches until it is paid out, so it is reported as a memo.

export type RevenueSource = "subscriptions" | "addon_packs" | "shared_fundraiser_fees" | "shared_event_fees";

export const REVENUE_SOURCE_LABELS: Record<RevenueSource, string> = {
  subscriptions: "Plan subscriptions",
  addon_packs: "Add-on packs (SMS, email, WhatsApp, storage)",
  shared_fundraiser_fees: "Shared-account fee: fundraisers",
  shared_event_fees: "Shared-account fee: paid events",
};

const REVENUE_SOURCES = Object.keys(REVENUE_SOURCE_LABELS) as RevenueSource[];

interface RevenueEvent {
  source: RevenueSource;
  amount: number;
  when: string;
}

export interface SourceTotal {
  source: RevenueSource;
  label: string;
  revenue: number;
  count: number;
}

export interface MonthRow {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  bySource: Record<RevenueSource, number>;
}

export interface PlatformEarningsReport {
  allTime: { revenue: number; expenses: number; net: number; heldForChurches: number };
  thisMonth: { month: string; revenue: number; expenses: number; net: number };
  bySource: SourceTotal[];
  months: MonthRow[];
  // Earliest subscription charge recorded. Charges before this were never
  // stored, so subscription revenue is understated for earlier months.
  subscriptionTrackingSince: string | null;
}

export interface ExpenseServiceSummary {
  key: string;
  label: string;
  lastPaidOn: string | null;
  last12Months: number;
}

export interface PlatformExpensesReport {
  services: ExpenseServiceSummary[];
  rows: PlatformExpense[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPlatformEarningsReport(now: Date = new Date()): Promise<PlatformEarningsReport> {
  const admin = createAdminClient();

  const [subs, addons, sharedDonations, eventOrders, expenses] = await Promise.all([
    admin.from("platform_subscription_payments").select("amount, paid_at"),
    admin.from("organization_addon_orders").select("amount, paid_at, created_at").eq("status", "paid"),
    admin.from("donations").select("amount, donated_on").eq("payment_mode", "shared"),
    admin.from("event_registration_payment_orders").select("amount, updated_at").eq("status", "paid"),
    admin.from("platform_expenses").select("paid_on, amount"),
  ]);

  const revenueEvents: RevenueEvent[] = [];
  for (const row of subs.data ?? []) {
    revenueEvents.push({ source: "subscriptions", amount: Number(row.amount), when: row.paid_at });
  }
  for (const row of addons.data ?? []) {
    revenueEvents.push({ source: "addon_packs", amount: Number(row.amount), when: row.paid_at ?? row.created_at });
  }
  let heldForChurches = 0;
  for (const row of sharedDonations.data ?? []) {
    const gross = Number(row.amount);
    heldForChurches += gross;
    revenueEvents.push({ source: "shared_fundraiser_fees", amount: sharedServiceFee(gross), when: row.donated_on });
  }
  for (const row of eventOrders.data ?? []) {
    const gross = Number(row.amount);
    heldForChurches += gross;
    revenueEvents.push({ source: "shared_event_fees", amount: sharedServiceFee(gross), when: row.updated_at });
  }

  const currentMonth = dateKeyInTimezone(now, DEFAULT_TIMEZONE).slice(0, 7);
  const months = recentMonthKeys(now, 12);
  const monthMap = new Map<string, MonthRow>(
    months.map((m) => [m, { month: m, revenue: 0, expenses: 0, net: 0, bySource: emptyBySource() }]),
  );
  const sourceMap = new Map<RevenueSource, SourceTotal>(
    REVENUE_SOURCES.map((s) => [s, { source: s, label: REVENUE_SOURCE_LABELS[s], revenue: 0, count: 0 }]),
  );

  let revenueAll = 0;
  let revenueThisMonth = 0;
  for (const event of revenueEvents) {
    revenueAll += event.amount;
    const sourceTotal = sourceMap.get(event.source)!;
    sourceTotal.revenue += event.amount;
    sourceTotal.count += 1;

    const month = monthKeyOfDate(event.when);
    if (month === currentMonth) revenueThisMonth += event.amount;
    const bucket = monthMap.get(month);
    if (bucket) {
      bucket.revenue += event.amount;
      bucket.bySource[event.source] += event.amount;
    }
  }

  let expensesAll = 0;
  let expensesThisMonth = 0;
  for (const expense of expenses.data ?? []) {
    const amount = Number(expense.amount);
    expensesAll += amount;
    const month = monthKeyOfDate(expense.paid_on);
    if (month === currentMonth) expensesThisMonth += amount;
    const bucket = monthMap.get(month);
    if (bucket) bucket.expenses += amount;
  }

  const monthRows = months.map((m) => {
    const bucket = monthMap.get(m)!;
    return {
      month: m,
      revenue: round2(bucket.revenue),
      expenses: round2(bucket.expenses),
      net: round2(bucket.revenue - bucket.expenses),
      bySource: Object.fromEntries(REVENUE_SOURCES.map((s) => [s, round2(bucket.bySource[s])])) as Record<RevenueSource, number>,
    };
  });

  const earliest = (subs.data ?? []).map((r) => r.paid_at).sort()[0] ?? null;

  return {
    allTime: {
      revenue: round2(revenueAll),
      expenses: round2(expensesAll),
      net: round2(revenueAll - expensesAll),
      heldForChurches: round2(heldForChurches),
    },
    thisMonth: {
      month: currentMonth,
      revenue: round2(revenueThisMonth),
      expenses: round2(expensesThisMonth),
      net: round2(revenueThisMonth - expensesThisMonth),
    },
    bySource: REVENUE_SOURCES.map((s) => {
      const t = sourceMap.get(s)!;
      return { ...t, revenue: round2(t.revenue) };
    }),
    months: monthRows,
    subscriptionTrackingSince: earliest ? monthKeyOfDate(earliest) : null,
  };
}

function emptyBySource(): Record<RevenueSource, number> {
  return { subscriptions: 0, addon_packs: 0, shared_fundraiser_fees: 0, shared_event_fees: 0 };
}

export async function getPlatformExpensesReport(now: Date = new Date()): Promise<PlatformExpensesReport> {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_expenses").select("*").order("paid_on", { ascending: false }).order("created_at", { ascending: false });
  const all = (data ?? []) as PlatformExpense[];

  const window = new Set(recentMonthKeys(now, 12));
  const services: ExpenseServiceSummary[] = PLATFORM_SERVICES.map((s) => {
    const mine = all.filter((e) => e.service === s.key);
    const lastPaidOn = mine[0]?.paid_on ?? null;
    const last12Months = mine
      .filter((e) => window.has(monthKeyOfDate(e.paid_on)))
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { key: s.key, label: platformServiceLabel(s.key), lastPaidOn, last12Months: round2(last12Months) };
  });

  return { services, rows: all.slice(0, 200) };
}
