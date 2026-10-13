import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { zonedTimeToUtc } from "@/lib/organizations/timezone";
import { money, periodDateRange, periodLabel, type MonthlyReportData, type MonthlySectionKey } from "@/lib/reports/monthly";

const PAGE = 5000;

/**
 * Works out a monthly church report from the church's own data: totals only, never
 * who gave what. Reads with the service role, so the caller must already have
 * checked that the person may see each section they asked for.
 */
export async function buildMonthlyReport(organizationId: string, period: string, sections: MonthlySectionKey[], timeZone: string): Promise<MonthlyReportData> {
  const admin = createAdminClient();
  const { from, toExclusive } = periodDateRange(period);
  const startUtc = zonedTimeToUtc(`${from}T00:00`, timeZone).toISOString();
  const endUtc = zonedTimeToUtc(`${toExclusive}T00:00`, timeZone).toISOString();
  const want = new Set(sections);

  const data: MonthlyReportData = { period, label: periodLabel(period), generatedAt: new Date().toISOString(), sections };

  if (want.has("members")) {
    const [{ count: total }, { count: joined }] = await Promise.all([
      admin.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "pending").lt("created_at", endUtc),
      admin.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "pending").gte("created_at", startUtc).lt("created_at", endUtc),
    ]);
    data.members = { total: total ?? 0, joined: joined ?? 0 };
  }

  if (want.has("attendance")) {
    const { data: sessions } = await admin
      .from("attendance_sessions")
      .select("id, title, occurrence_date, headcount, recorded_at")
      .eq("organization_id", organizationId)
      .gte("occurrence_date", from)
      .lt("occurrence_date", toExclusive)
      .not("recorded_at", "is", null);
    const ids = (sessions ?? []).map((s) => s.id);
    const perSession = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: records } = await admin.from("attendance_records").select("session_id").in("session_id", ids.slice(i, i + 200)).limit(PAGE * 4);
      for (const r of records ?? []) perSession.set(r.session_id, (perSession.get(r.session_id) ?? 0) + 1);
    }
    // A session's attendance is its marked members, or the headcount someone entered if that is higher.
    const counts = (sessions ?? []).map((s) => ({ title: s.title, date: s.occurrence_date, count: Math.max(perSession.get(s.id) ?? 0, s.headcount ?? 0) }));
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    const best = counts.length ? counts.reduce((a, b) => (b.count > a.count ? b : a)) : null;
    data.attendance = { services: counts.length, total, average: counts.length ? Math.round(total / counts.length) : 0, best };
  }

  if (want.has("events")) {
    const { data: events } = await admin
      .from("events")
      .select("title, start_at")
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .gte("start_at", startUtc)
      .lt("start_at", endUtc)
      .order("start_at", { ascending: true })
      .limit(200);
    const list = (events ?? []).map((e) => ({ title: e.title, date: e.start_at.slice(0, 10) }));
    data.events = { held: list.length, list: list.slice(0, 12) };
  }

  let offeringsTotal = 0;
  let donationsTotal = 0;
  if (want.has("giving") || want.has("expenses")) {
    const [{ data: offerings }, { data: donations }] = await Promise.all([
      admin.from("offerings").select("amount, category").eq("organization_id", organizationId).gte("collected_on", from).lt("collected_on", toExclusive).limit(PAGE),
      admin.from("donations").select("amount").eq("organization_id", organizationId).gte("donated_on", from).lt("donated_on", toExclusive).limit(PAGE),
    ]);
    offeringsTotal = money((offerings ?? []).reduce((sum, o) => sum + Number(o.amount), 0));
    donationsTotal = money((donations ?? []).reduce((sum, d) => sum + Number(d.amount), 0));
    if (want.has("giving")) {
      const byCategory = new Map<string, number>();
      for (const o of offerings ?? []) byCategory.set(o.category || "Other", (byCategory.get(o.category || "Other") ?? 0) + Number(o.amount));
      data.giving = {
        offerings: offeringsTotal,
        donations: donationsTotal,
        total: money(offeringsTotal + donationsTotal),
        byCategory: [...byCategory.entries()].map(([name, amount]) => ({ name, amount: money(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 8),
      };
    }
  }

  if (want.has("expenses")) {
    const { data: expenses } = await admin.from("expenses").select("amount").eq("organization_id", organizationId).gte("expense_date", from).lt("expense_date", toExclusive).limit(PAGE);
    const spent = money((expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0));
    const income = money(offeringsTotal + donationsTotal);
    data.expenses = { expenses: spent, income, balance: money(income - spent) };
  }

  if (want.has("volunteers")) {
    const [{ count: active }, { count: joined }] = await Promise.all([
      admin.from("volunteers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active").lt("joined_on", toExclusive),
      admin.from("volunteers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("joined_on", from).lt("joined_on", toExclusive),
    ]);
    data.volunteers = { active: active ?? 0, joined: joined ?? 0 };
  }

  if (want.has("prayer")) {
    const [{ count: received }, { count: answered }] = await Promise.all([
      admin.from("prayer_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", startUtc).lt("created_at", endUtc),
      admin.from("prayer_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("answered_at", startUtc).lt("answered_at", endUtc),
    ]);
    data.prayer = { received: received ?? 0, answered: answered ?? 0 };
  }

  return data;
}
