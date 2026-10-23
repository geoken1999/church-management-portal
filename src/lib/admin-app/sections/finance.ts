import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPlatformEarningsReport,
  getPlatformExpensesReport,
} from "@/lib/platform-admin/finance";
import {
  INVESTMENT_CATEGORIES,
  PLATFORM_SERVICES,
  investmentCategoryLabel,
  platformServiceLabel,
  validateExpenseInput,
  validateInvestmentInput,
} from "@/lib/platform-admin/finance-config";
import {
  getCourseLedgerAdmin,
  getEventPayoutLedgerAdmin,
  getMembershipLedgerAdmin,
  getSharedFundraiserLedger,
  type PendingPayoutRequest,
} from "@/lib/platform-admin/dal";
import {
  sendCoursePayoutProcessedEmail,
  sendEventPayoutProcessedEmail,
  sendMembershipPayoutProcessedEmail,
} from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { SectionAction, SectionItem } from "@/lib/admin-app/section-types";
import { day, fail, inr, ok, type AdminSection } from "./common";

const earnings: AdminSection = {
  key: "earnings",
  scope: "finance",
  title: "Earnings",
  description: "Revenue, expenses and net, by source and month",
  icon: "trending_up",
  async load() {
    const r = await getPlatformEarningsReport();
    return {
      title: "Earnings",
      note: r.subscriptionTrackingSince
        ? `Subscription charges are recorded from ${day(r.subscriptionTrackingSince)}; earlier months understate subscription revenue.`
        : undefined,
      summary: [
        { label: "All-time revenue", value: inr(r.allTime.revenue) },
        { label: "All-time expenses", value: inr(r.allTime.expenses) },
        { label: "All-time net", value: inr(r.allTime.net) },
        { label: "Held for churches", value: inr(r.allTime.heldForChurches) },
        { label: "Invested, all time", value: inr(r.allTime.invested) },
        { label: `This month (${r.thisMonth.month})`, value: inr(r.thisMonth.net) },
      ],
      groups: [
        {
          title: "By source",
          items: r.bySource.map((s) => ({
            id: s.source,
            title: s.label,
            badge: inr(s.revenue),
            subtitle: `${s.count} payment${s.count === 1 ? "" : "s"}`,
          })),
        },
        {
          title: "By month",
          items: [...r.months].reverse().map((m) => ({
            id: m.month,
            title: m.month,
            badge: inr(m.net),
            tone: m.net < 0 ? ("bad" as const) : ("good" as const),
            subtitle: `Revenue ${inr(m.revenue)} · Expenses ${inr(m.expenses)}`,
            fields: Object.entries(m.bySource).map(([k, v]) => ({
              label: k.replace(/_/g, " "),
              value: inr(v as number),
            })),
          })),
        },
      ],
    };
  },
};

const expenseInputs = [
  {
    key: "service",
    label: "Service",
    kind: "select" as const,
    required: true,
    options: PLATFORM_SERVICES.map((s) => ({ value: s.key, label: s.label })),
  },
  { key: "description", label: "What was it for", kind: "text" as const, required: true },
  { key: "amount", label: "Amount (₹)", kind: "number" as const, required: true },
  { key: "paidOn", label: "Paid on (YYYY-MM-DD)", kind: "date" as const, required: true },
  { key: "vendor", label: "Vendor (optional)", kind: "text" as const },
  { key: "reference", label: "Reference (optional)", kind: "text" as const },
];

const investmentInputs = [
  { key: "investor", label: "Invested by", kind: "text" as const, required: true },
  {
    key: "category",
    label: "Kind",
    kind: "select" as const,
    required: true,
    initial: "capital",
    options: INVESTMENT_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
  },
  { key: "amount", label: "Amount (₹)", kind: "number" as const, required: true },
  { key: "investedOn", label: "Invested on (YYYY-MM-DD)", kind: "date" as const, required: true },
  { key: "purpose", label: "What it is for (optional)", kind: "text" as const },
  { key: "reference", label: "Reference (optional)", kind: "text" as const },
];

const expenses: AdminSection = {
  key: "expenses",
  scope: "finance",
  title: "Expenses & investments",
  description: "What it costs to run the platform and the money put into it",
  icon: "receipt_long",
  async load() {
    const r = await getPlatformExpensesReport();
    return {
      title: "Expenses",
      summary: [{ label: "Total invested", value: inr(r.totalInvested) }],
      actions: [
        { key: "add", label: "Record expense", inputs: expenseInputs },
        { key: "invest", label: "Record investment", inputs: investmentInputs },
      ],
      groups: [
        {
          title: "Services (last 12 months)",
          items: r.services.map((s) => ({
            id: s.key,
            title: s.label,
            badge: inr(s.last12Months),
            subtitle: s.lastPaidOn ? `Last paid ${day(s.lastPaidOn)}` : "Never paid",
          })),
        },
        {
          title: "Recent expenses",
          items: r.rows.map((e) => ({
            id: e.id,
            title: e.description,
            badge: inr(e.amount),
            subtitle: `${platformServiceLabel(e.service)} · ${day(e.paid_on)}`,
            fields: [
              { label: "Vendor", value: e.vendor ?? "—" },
              { label: "Reference", value: e.reference ?? "—" },
            ],
            actions: [
              {
                key: "delete",
                label: "Delete",
                danger: true,
                confirm: "Delete this expense? It stops counting in the earnings.",
              },
            ],
          })),
        },
        {
          title: "Investments",
          items: r.investments.map((i) => ({
            id: i.id,
            title: i.investor,
            badge: inr(i.amount),
            tone: "good" as const,
            subtitle: `${investmentCategoryLabel(i.category)} · ${day(i.invested_on)}`,
            fields: [
              { label: "Purpose", value: i.purpose ?? "—" },
              { label: "Reference", value: i.reference ?? "—" },
            ],
            actions: [
              {
                key: "delete_investment",
                label: "Delete",
                danger: true,
                confirm: "Delete this investment record?",
              },
            ],
          })),
        },
      ].filter((g) => g.title !== "Investments" || g.items.length > 0),
      empty: "No expenses recorded.",
    };
  },
  async act(caller, action, id, input) {
    const admin = createAdminClient();
    if (action === "delete_investment" && id) {
      await admin.from("platform_investments").delete().eq("id", id);
      return ok("Investment deleted.");
    }
    if (action === "invest") {
      const amount = input.amount?.trim() === "" ? Number.NaN : Number(input.amount);
      const errors = validateInvestmentInput({
        investor: input.investor ?? "",
        category: input.category ?? "",
        amount,
        investedOn: input.investedOn ?? "",
      });
      const first = Object.values(errors)[0];
      if (first) return fail(String(first));
      const { error } = await admin.from("platform_investments").insert({
        investor: input.investor.trim(),
        category: input.category as "capital" | "investor" | "loan" | "grant" | "other",
        amount,
        invested_on: input.investedOn,
        purpose: input.purpose?.trim() || null,
        reference: input.reference?.trim() || null,
        created_by: caller.userId,
      });
      if (error) return fail("Couldn't record that investment. Please try again.");
      await logPlatformEvent({
        level: "info",
        source: "platform_admin",
        message: `Recorded platform investment of ${amount} from ${input.investor} (admin app, ${caller.email})`,
      });
      return ok("Investment recorded.");
    }
    if (action === "delete" && id) {
      await admin.from("platform_expenses").delete().eq("id", id);
      return ok("Expense deleted.");
    }
    if (action === "add") {
      const amount = input.amount?.trim() === "" ? Number.NaN : Number(input.amount);
      const errors = validateExpenseInput({
        service: input.service ?? "",
        description: (input.description ?? "").trim(),
        amount,
        paidOn: input.paidOn ?? "",
      });
      const first = Object.values(errors)[0];
      if (first) return fail(String(first));
      const { error } = await admin.from("platform_expenses").insert({
        service: input.service,
        description: input.description.trim(),
        vendor: input.vendor?.trim() || null,
        reference: input.reference?.trim() || null,
        amount,
        paid_on: input.paidOn,
        created_by: caller.userId,
      });
      if (error) return fail("Couldn't record that expense. Please try again.");
      await logPlatformEvent({
        level: "info",
        source: "platform_admin",
        message: `Recorded platform expense of ${amount} for ${input.service} (admin app, ${caller.email})`,
      });
      return ok("Expense recorded.");
    }
    return fail("Unknown action.");
  },
};

function destination(r: PendingPayoutRequest | null): string | null {
  if (!r) return null;
  if (r.payoutMethod === "bank_transfer")
    return `Bank — ${r.bankAccountHolder} · …${(r.bankAccountNumber ?? "").slice(-4)} · IFSC ${r.bankIfsc} · ${r.bankName}`;
  if (r.payoutMethod === "upi") return `UPI — ${r.upiId}`;
  return null;
}

const recordPayout: SectionAction = {
  key: "pay",
  label: "Record payout",
  confirm: "Record that this amount was wired to the church? This doesn't move money.",
  inputs: [
    { key: "amount", label: "Amount paid (₹)", kind: "number", required: true },
    { key: "note", label: "Note (optional)", kind: "text" },
  ],
};

function ledgerItem(
  id: string,
  title: string,
  subtitle: string,
  e: { collected: number; paidOut: number; owed: number; pendingRequest: PendingPayoutRequest | null },
): SectionItem {
  return {
    id,
    title,
    subtitle,
    badge: `Owed ${inr(e.owed)}`,
    tone: e.pendingRequest ? "warn" : e.owed > 0 ? "info" : undefined,
    fields: [
      { label: "Collected", value: inr(e.collected) },
      { label: "Paid out", value: inr(e.paidOut) },
      { label: "Owed", value: inr(e.owed) },
      ...(e.pendingRequest
        ? [
            { label: "Payout requested", value: inr(e.pendingRequest.amount) },
            { label: "Send to", value: destination(e.pendingRequest) ?? "—" },
          ]
        : []),
    ],
    actions: e.owed > 0 || e.pendingRequest ? [recordPayout] : undefined,
  };
}

const payouts: AdminSection = {
  key: "payouts",
  scope: "finance",
  title: "Payouts",
  description: "What the platform holds for churches, and payout requests",
  icon: "account_balance",
  async load() {
    const [fund, event, membership, course] = await Promise.all([
      getSharedFundraiserLedger(),
      getEventPayoutLedgerAdmin(),
      getMembershipLedgerAdmin(),
      getCourseLedgerAdmin(),
    ]);
    const requests =
      fund.filter((e) => e.pendingRequest).length +
      event.filter((e) => e.pendingRequest).length +
      membership.filter((e) => e.pendingRequest).length +
      course.filter((e) => e.pendingRequest).length;
    const owed = [...fund, ...event, ...membership, ...course].reduce((s, e) => s + e.owed, 0);
    return {
      title: "Payouts",
      note: "Recording a payout is bookkeeping only: wire the money first, then record it here.",
      summary: [
        { label: "Owed to churches", value: inr(owed) },
        { label: "Payout requests waiting", value: String(requests) },
      ],
      groups: [
        {
          title: "Fundraisers",
          items: fund.map((e) => ledgerItem(`fundraiser:${e.fundraiserId}:${e.organizationId}`, e.fundraiserTitle, e.organizationName, e)),
        },
        {
          title: "Events",
          items: event.map((e) => ledgerItem(`event:${e.eventId}:${e.organizationId}`, e.eventTitle, e.organizationName, e)),
        },
        {
          title: "Membership fees",
          items: membership.map((e) => ledgerItem(`membership:${e.organizationId}`, e.organizationName, "Membership fees", e)),
        },
        {
          title: "Course fees",
          items: course.map((e) => ledgerItem(`course:${e.organizationId}`, e.organizationName, "Course fees", e)),
        },
      ].filter((g) => g.items.length > 0),
      empty: "Nothing is being held for churches.",
    };
  },
  async act(caller, action, id, input) {
    if (action !== "pay" || !id) return fail("Unknown action.");
    const amount = Number(input.amount);
    if (!input.amount?.trim() || Number.isNaN(amount) || amount <= 0)
      return fail("Enter an amount greater than 0.");
    const note = (input.note ?? "").trim() || null;
    const [kind, a, b] = id.split(":");
    const admin = createAdminClient();
    const log = (organizationId: string, what: string, payoutId: string) =>
      logPlatformEvent({
        level: "info",
        source: "platform_admin",
        message: `Recorded ${what} payout of ${amount} (admin app, ${caller.email})`,
        organizationId,
        metadata: { payoutId },
      });
    if (kind === "fundraiser") {
      const { data, error } = await admin
        .from("fundraiser_payouts")
        .insert({ organization_id: b, fundraiser_id: a, amount, note, paid_by: caller.userId })
        .select("id")
        .single();
      if (error || !data) return fail("Couldn't record that payout. Please try again.");
      await admin.from("fundraiser_payout_requests").update({ status: "paid", resolved_payout_id: data.id }).eq("fundraiser_id", a).eq("status", "pending");
      await log(b, "fundraiser", data.id);
      return ok("Payout recorded.");
    }
    if (kind === "event") {
      const { data, error } = await admin
        .from("event_payouts")
        .insert({ organization_id: b, event_id: a, amount, note, paid_by: caller.userId })
        .select("id")
        .single();
      if (error || !data) return fail("Couldn't record that payout. Please try again.");
      await admin.from("event_payout_requests").update({ status: "paid", resolved_payout_id: data.id }).eq("event_id", a).eq("status", "pending");
      const { data: event } = await admin.from("events").select("title").eq("id", a).maybeSingle();
      await sendEventPayoutProcessedEmail(b, event?.title ?? "your event", amount);
      await log(b, "event", data.id);
      return ok("Payout recorded.");
    }
    if (kind === "membership" || kind === "course") {
      const table = kind === "membership" ? "membership_payouts" : "course_payouts";
      const requests = kind === "membership" ? "membership_payout_requests" : "course_payout_requests";
      const { data, error } = await admin
        .from(table)
        .insert({ organization_id: a, amount, note, paid_by: caller.userId })
        .select("id")
        .single();
      if (error || !data) return fail("Couldn't record that payout. Please try again.");
      await admin.from(requests).update({ status: "paid", resolved_payout_id: data.id }).eq("organization_id", a).eq("status", "pending");
      if (kind === "membership") await sendMembershipPayoutProcessedEmail(a, amount);
      else await sendCoursePayoutProcessedEmail(a, amount);
      await log(a, kind, data.id);
      return ok("Payout recorded.");
    }
    return fail("Unknown payout.");
  },
};

export const financeSections = [earnings, expenses, payouts];
