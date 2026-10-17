import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { zonedTimeToUtc } from "@/lib/organizations/timezone";
import {
  dateLabelIn,
  money,
  monthShortIn,
  periodLabelIn,
  rangeOf,
  reportLabels,
  isYear,
  type Letterhead,
  type MonthlyReportData,
  type MonthlySectionKey,
  type ReportLanguage,
} from "@/lib/reports/monthly";

const PAGE = 20000;

export interface BuildReportInput {
  organizationId: string;
  period: string; // "YYYY-MM" or "YYYY"
  sections: MonthlySectionKey[];
  timeZone: string;
  language: ReportLanguage;
  branchId: string | null;
  letterhead: Letterhead;
  logoUrl: string | null;
}

/**
 * Works out a monthly or annual church report from the church's own data (for the
 * whole church or one branch): totals only, never who gave what. Reads with the
 * service role, so the caller must already have checked that the person may see each
 * section they asked for.
 */
export async function buildMonthlyReport(input: BuildReportInput): Promise<MonthlyReportData> {
  const { organizationId, period, sections, timeZone, language, branchId } = input;
  const admin = createAdminClient();
  const annual = isYear(period);
  const { from, toExclusive } = rangeOf(period);
  const startUtc = zonedTimeToUtc(`${from}T00:00`, timeZone).toISOString();
  const endUtc = zonedTimeToUtc(`${toExclusive}T00:00`, timeZone).toISOString();
  const want = new Set(sections);

  let branchName: string | null = null;
  if (branchId) {
    const { data: branch } = await admin.from("branches").select("name").eq("id", branchId).eq("organization_id", organizationId).maybeSingle();
    branchName = branch?.name ?? null;
  }

  // For a branch report, the members who belong to it (prayer requests belong to a member).
  let branchMemberIds: string[] = [];
  if (branchId && want.has("prayer")) {
    const { data } = await admin.from("members").select("id").eq("organization_id", organizationId).eq("branch_id", branchId).limit(PAGE);
    branchMemberIds = (data ?? []).map((m) => m.id);
  }

  const data: MonthlyReportData = {
    kind: annual ? "annual" : "monthly",
    language,
    period,
    label: periodLabelIn(period, language),
    generatedAt: new Date().toISOString(),
    sections,
    labels: reportLabels(language),
    branchName,
    letterhead: input.letterhead,
    logoUrl: input.logoUrl,
    narrative: null,
    photos: [],
  };

  if (want.has("members")) {
    const base = () => {
      let q = admin.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "pending").neq("status", "student");
      if (branchId) q = q.eq("branch_id", branchId);
      return q;
    };
    const [{ count: total }, { count: joined }] = await Promise.all([base().lt("created_at", endUtc), base().gte("created_at", startUtc).lt("created_at", endUtc)]);
    data.members = { total: total ?? 0, joined: joined ?? 0 };
  }

  if (want.has("attendance")) {
    let query = admin.from("attendance_sessions").select("id, title, occurrence_date, headcount").eq("organization_id", organizationId).gte("occurrence_date", from).lt("occurrence_date", toExclusive).not("recorded_at", "is", null);
    if (branchId) query = query.eq("branch_id", branchId);
    const { data: sessions } = await query.limit(PAGE);
    const ids = (sessions ?? []).map((s) => s.id);
    const perSession = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: records } = await admin.from("attendance_records").select("session_id").in("session_id", ids.slice(i, i + 200)).limit(PAGE);
      for (const r of records ?? []) perSession.set(r.session_id, (perSession.get(r.session_id) ?? 0) + 1);
    }
    // A session's attendance is its marked members, or the headcount someone entered if that is higher.
    const counts = (sessions ?? []).map((s) => ({ title: s.title, date: s.occurrence_date, count: Math.max(perSession.get(s.id) ?? 0, s.headcount ?? 0) }));
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    const best = counts.length ? counts.reduce((a, b) => (b.count > a.count ? b : a)) : null;
    data.attendance = { services: counts.length, total, average: counts.length ? Math.round(total / counts.length) : 0, best: best ? { ...best, dateLabel: dateLabelIn(best.date, language) } : null };
  }

  if (want.has("events")) {
    let query = admin.from("events").select("title, start_at, flyer_path").eq("organization_id", organizationId).neq("status", "cancelled").gte("start_at", startUtc).lt("start_at", endUtc).order("start_at", { ascending: true });
    if (branchId) query = query.eq("branch_id", branchId);
    const { data: events } = await query.limit(500);
    const list = (events ?? []).map((e) => ({ title: e.title, date: e.start_at.slice(0, 10), dateLabel: dateLabelIn(e.start_at, language), ...(e.flyer_path ? { flyerPath: e.flyer_path } : {}) }));
    data.events = { held: list.length, list: list.slice(0, annual ? 20 : 12) };
  }

  // Giving: offerings can be told apart by branch; donations belong to a donor, not a branch.
  const includeDonations = !branchId;
  let offeringRows: { amount: number; category: string; collected_on: string }[] = [];
  let donationRows: { amount: number; donated_on: string }[] = [];
  if (want.has("giving") || want.has("expenses")) {
    let offeringsQuery = admin.from("offerings").select("amount, category, collected_on").eq("organization_id", organizationId).gte("collected_on", from).lt("collected_on", toExclusive);
    if (branchId) offeringsQuery = offeringsQuery.eq("branch_id", branchId);
    const [{ data: offerings }, { data: donations }] = await Promise.all([
      offeringsQuery.limit(PAGE),
      includeDonations
        ? admin.from("donations").select("amount, donated_on").eq("organization_id", organizationId).gte("donated_on", from).lt("donated_on", toExclusive).limit(PAGE)
        : Promise.resolve({ data: [] as { amount: number; donated_on: string }[] }),
    ]);
    offeringRows = (offerings ?? []).map((o) => ({ amount: Number(o.amount), category: o.category, collected_on: o.collected_on }));
    donationRows = (donations ?? []).map((d) => ({ amount: Number(d.amount), donated_on: d.donated_on }));
  }
  const offeringsTotal = money(offeringRows.reduce((sum, o) => sum + o.amount, 0));
  const donationsTotal = money(donationRows.reduce((sum, d) => sum + d.amount, 0));

  if (want.has("giving")) {
    const byCategory = new Map<string, number>();
    for (const o of offeringRows) byCategory.set(o.category || "Other", (byCategory.get(o.category || "Other") ?? 0) + o.amount);
    data.giving = {
      offerings: offeringsTotal,
      donations: donationsTotal,
      total: money(offeringsTotal + donationsTotal),
      byCategory: [...byCategory.entries()].map(([name, amount]) => ({ name, amount: money(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 8),
    };
  }

  let expenseRows: { amount: number; expense_date: string }[] = [];
  if (want.has("expenses")) {
    let query = admin.from("expenses").select("amount, expense_date").eq("organization_id", organizationId).gte("expense_date", from).lt("expense_date", toExclusive);
    if (branchId) query = query.eq("branch_id", branchId);
    const { data: expenses } = await query.limit(PAGE);
    expenseRows = (expenses ?? []).map((e) => ({ amount: Number(e.amount), expense_date: e.expense_date }));
    const spent = money(expenseRows.reduce((sum, e) => sum + e.amount, 0));
    const income = money(offeringsTotal + donationsTotal);
    data.expenses = { expenses: spent, income, balance: money(income - spent) };
  }

  // An annual report shows giving and expenses month by month.
  if (annual && (want.has("giving") || want.has("expenses"))) {
    const months = Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`);
    data.byMonth = months.map((m) => ({
      month: monthShortIn(m, language),
      giving: money([...offeringRows.filter((o) => o.collected_on.startsWith(m)), ...donationRows.filter((d) => d.donated_on.startsWith(m))].reduce((sum, r) => sum + r.amount, 0)),
      expenses: money(expenseRows.filter((e) => e.expense_date.startsWith(m)).reduce((sum, e) => sum + e.amount, 0)),
    }));
  }

  if (want.has("volunteers")) {
    const base = () => {
      let q = admin.from("volunteers").select("id, members!inner(branch_id)", { count: "exact", head: true }).eq("organization_id", organizationId);
      if (branchId) q = q.eq("members.branch_id", branchId);
      return q;
    };
    const [{ count: active }, { count: joined }] = await Promise.all([base().eq("status", "active").lt("joined_on", toExclusive), base().gte("joined_on", from).lt("joined_on", toExclusive)]);
    data.volunteers = { active: active ?? 0, joined: joined ?? 0 };
  }

  if (want.has("prayer")) {
    const count = async (column: "created_at" | "answered_at") => {
      if (!branchId) {
        const { count: n } = await admin.from("prayer_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte(column, startUtc).lt(column, endUtc);
        return n ?? 0;
      }
      let total = 0;
      for (let i = 0; i < branchMemberIds.length; i += 400) {
        const { count: n } = await admin.from("prayer_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("member_id", branchMemberIds.slice(i, i + 400)).gte(column, startUtc).lt(column, endUtc);
        total += n ?? 0;
      }
      return total;
    };
    data.prayer = { received: await count("created_at"), answered: await count("answered_at") };
  }

  return data;
}
