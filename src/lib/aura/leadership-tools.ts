import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getBranches } from "@/lib/branches/dal";
import { getMinistries } from "@/lib/ministries/dal";
import { getEvents } from "@/lib/events/dal";
import { getOccurrencesInRange } from "@/lib/events/recurrence";
import { getAiDataAccessRules, type AiDataAccessRules } from "@/lib/ai-rules/dal";
import {
  missedInARow,
  monthlyTotals,
  rankSignals,
  trendOf,
  upcomingCelebrations,
  type SessionAttendance,
  type Signal,
} from "@/lib/aura/insights-math";
import type { ToolDefinition } from "@/lib/ai/openai";

// What turns Aura from a lookup chatbot into an adviser for a pastor or church leader: tools that read across
// the church's records and work out what needs attention (who is slipping away, whether attendance and giving
// are rising or falling, what is overdue). Every query runs with the signed-in person's own session, so it only
// ever sees what they could already open themselves, and each tool is switched off with its AI Rules category.

export const LEADERSHIP_TOOL_CATEGORY: Record<string, keyof AiDataAccessRules> = {
  get_church_health: "allowMembers",
  find_members_needing_followup: "allowAttendance",
  get_attendance_trend: "allowAttendance",
  get_giving_trend: "allowFinance",
  list_overdue_todos: "allowMembers",
  list_upcoming_celebrations: "allowMembers",
  list_new_members: "allowMembers",
  find_member: "allowMembers",
  list_pending_approvals: "allowMembers",
};

export const LEADERSHIP_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_church_health",
      description:
        "A whole-church health check: attendance trend, members slipping away, new people, giving trend, upcoming events, ministries and branches without a leader, overdue tasks, pending approvals and app adoption. Returns findings ranked by urgency with a suggested action for each. Call this for open questions like 'how is my church doing', 'where are we lacking' or 'what should I focus on'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_members_needing_followup",
      description:
        "Members who have missed several recorded attendance sessions in a row (people who may be drifting away and need a visit or call), with their phone number and when they last came.",
      parameters: {
        type: "object",
        properties: {
          min_missed: { type: "integer", description: "How many sessions in a row they missed. Defaults to 3." },
          branch_name: { type: "string", description: "Only this branch (partial name). Omit for all branches." },
          limit: { type: "integer", description: "Max people to return. Defaults to 25." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance_trend",
      description: "How many attended each of the recent recorded sessions, oldest to newest, and whether attendance is rising, falling or steady.",
      parameters: {
        type: "object",
        properties: {
          sessions: { type: "integer", description: "How many recent recorded sessions to look at (4-24). Defaults to 12." },
          branch_name: { type: "string", description: "Only this branch (partial name). Omit for all." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_giving_trend",
      description: "Offerings and donations totalled per month for the last months, and how this month compares with last month and the average of the months before.",
      parameters: { type: "object", properties: { months: { type: "integer", description: "How many months (2-12). Defaults to 6." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_overdue_todos",
      description: "To-dos that are past their due date and not done, most overdue first.",
      parameters: { type: "object", properties: { limit: { type: "integer", description: "Defaults to 15." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_upcoming_celebrations",
      description: "Members' birthdays and wedding anniversaries coming up, for pastoral care and greetings.",
      parameters: { type: "object", properties: { days: { type: "integer", description: "How many days ahead (1-60). Defaults to 14." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_new_members",
      description: "People who joined recently, with their branch and join date, so they can be welcomed and followed up.",
      parameters: { type: "object", properties: { days: { type: "integer", description: "How far back (1-180). Defaults to 30." }, limit: { type: "integer", description: "Defaults to 25." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "find_member",
      description: "Look up a member by name: contact details, branch, status, when they joined and when they last attended.",
      parameters: { type: "object", properties: { name: { type: "string", description: "Part of the first or last name." } }, required: ["name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_pending_approvals",
      description: "Things waiting for a leader to approve: people asking to join, members' detail changes, and family requests. Also open prayer requests waiting.",
      parameters: { type: "object", properties: {} },
    },
  },
];

type Args = Record<string, unknown>;
const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asInt = (v: unknown, fallback: number, min = 1, max = 1000) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
const fullName = (m: { first_name: string; last_name: string | null }) => `${m.first_name} ${m.last_name ?? ""}`.trim();
const todayKey = () => new Date().toISOString().slice(0, 10);

/** Reads every row of a query in pages (a single request returns at most 1000). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface RosterMember {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  branch_id: string | null;
  created_at: string;
}

async function activeMembers(organizationId: string): Promise<RosterMember[]> {
  const supabase = await createClient();
  return fetchAll<RosterMember>((from, to) =>
    supabase
      .from("members")
      .select("id, first_name, last_name, phone, branch_id, created_at")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .range(from, to),
  );
}

async function branchIdByName(organizationId: string, name: string | undefined): Promise<{ id: string | null; error?: string }> {
  if (!name) return { id: null };
  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("id").eq("organization_id", organizationId).ilike("name", `%${name}%`).limit(1).maybeSingle();
  return data ? { id: data.id } : { id: null, error: `No branch found matching "${name}".` };
}

interface LoadedSessions {
  sessions: SessionAttendance[];
  titles: Map<string, string>;
  roster: RosterMember[];
}

/** The newest recorded sessions with who was expected and who came. Sessions never recorded say nothing about absence, so they are left out. */
async function loadRecordedSessions(organizationId: string, count: number, branchId: string | null): Promise<LoadedSessions> {
  const supabase = await createClient();
  let query = supabase
    .from("attendance_sessions")
    .select("id, title, occurrence_date, branch_id")
    .eq("organization_id", organizationId)
    .not("recorded_at", "is", null)
    .order("occurrence_date", { ascending: false })
    .limit(count);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data: rows } = await query;
  const sessionRows = rows ?? [];
  const roster = await activeMembers(organizationId);
  if (sessionRows.length === 0) return { sessions: [], titles: new Map(), roster };

  const ids = sessionRows.map((s) => s.id);
  const records = await fetchAll<{ session_id: string; member_id: string }>((from, to) =>
    supabase.from("attendance_records").select("session_id, member_id").in("session_id", ids).range(from, to),
  );
  const attendedBySession = new Map<string, Set<string>>();
  for (const r of records) attendedBySession.set(r.session_id, (attendedBySession.get(r.session_id) ?? new Set()).add(r.member_id));

  const sessions: SessionAttendance[] = sessionRows.map((s) => ({
    id: s.id,
    date: s.occurrence_date,
    // Expected: active members of the session's branch (everyone if it has none) who had joined by then.
    rosterIds: new Set(roster.filter((m) => (!s.branch_id || m.branch_id === s.branch_id) && m.created_at.slice(0, 10) <= s.occurrence_date).map((m) => m.id)),
    attendedIds: attendedBySession.get(s.id) ?? new Set(),
  }));
  return { sessions, titles: new Map(sessionRows.map((s) => [s.id, s.title])), roster };
}

async function findMembersNeedingFollowup(organizationId: string, args: Args) {
  const branch = await branchIdByName(organizationId, asString(args.branch_name));
  if (branch.error) return { error: branch.error };
  const need = asInt(args.min_missed, 3, 2, 12);
  const limit = asInt(args.limit, 25, 1, 100);
  const { sessions, roster } = await loadRecordedSessions(organizationId, Math.max(need + 3, 8), branch.id);
  if (sessions.length < need) return { error: `Only ${sessions.length} attendance sessions have been recorded, so I can't tell who has missed ${need} in a row yet.` };
  const byId = new Map(roster.map((m) => [m.id, m]));
  const streaks = missedInARow(sessions, need).filter((s) => byId.has(s.memberId));
  return {
    sessions_checked: sessions.length,
    from: sessions[sessions.length - 1].date,
    to: sessions[0].date,
    total_found: streaks.length,
    members: streaks.slice(0, limit).map((s) => {
      const m = byId.get(s.memberId)!;
      return { name: fullName(m), phone: m.phone, sessions_missed_in_a_row: s.misses, last_attended: s.lastAttended ?? `not in the last ${sessions.length} sessions` };
    }),
  };
}

async function getAttendanceTrend(organizationId: string, args: Args) {
  const branch = await branchIdByName(organizationId, asString(args.branch_name));
  if (branch.error) return { error: branch.error };
  const count = asInt(args.sessions, 12, 4, 24);
  const supabase = await createClient();
  let query = supabase
    .from("attendance_sessions")
    .select("id, title, occurrence_date, headcount, attendance_records(count)")
    .eq("organization_id", organizationId)
    .not("recorded_at", "is", null)
    .order("occurrence_date", { ascending: false })
    .limit(count);
  if (branch.id) query = query.eq("branch_id", branch.id);
  const { data } = await query;
  const rows = (data ?? []).map((s) => ({
    date: s.occurrence_date,
    title: s.title,
    attended: Array.isArray(s.attendance_records) ? (s.attendance_records[0]?.count ?? 0) : 0,
    headcount: s.headcount,
  }));
  if (rows.length === 0) return { error: "No attendance sessions have been recorded yet." };
  // The checked-in count, or the headcount when a leader only counted heads.
  const counts = rows.map((r) => Math.max(r.attended, r.headcount ?? 0));
  return {
    sessions: [...rows].reverse().map((r, i) => ({ date: r.date, title: r.title, attended: counts[rows.length - 1 - i] })),
    trend: trendOf(counts),
    best: Math.max(...counts),
    latest: counts[0],
  };
}

async function getGivingTrend(organizationId: string, args: Args) {
  const months = asInt(args.months, 6, 2, 12);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString().slice(0, 10);
  const supabase = await createClient();
  const [offerings, donations] = await Promise.all([
    fetchAll<{ collected_on: string; amount: number }>((from, to) =>
      supabase.from("offerings").select("collected_on, amount").eq("organization_id", organizationId).gte("collected_on", since).range(from, to),
    ),
    fetchAll<{ donated_on: string; amount: number }>((from, to) =>
      supabase.from("donations").select("donated_on, amount").eq("organization_id", organizationId).gte("donated_on", since).range(from, to),
    ),
  ]);
  const off = monthlyTotals(offerings.map((o) => ({ date: o.collected_on, amount: Number(o.amount) })), now, months);
  const don = monthlyTotals(donations.map((d) => ({ date: d.donated_on, amount: Number(d.amount) })), now, months);
  const combined = off.map((o, i) => ({ month: o.month, offerings: o.total, donations: don[i].total, total: Math.round((o.total + don[i].total) * 100) / 100 }));
  const totals = combined.map((c) => c.total);
  const thisMonth = totals[totals.length - 1];
  const lastMonth = totals[totals.length - 2] ?? 0;
  const before = totals.slice(0, -1);
  const average = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
  return {
    months: combined,
    this_month_so_far: thisMonth,
    last_month: lastMonth,
    average_of_earlier_months: Math.round(average * 100) / 100,
    note: "This month is not finished, so compare it with last month's total with that in mind.",
  };
}

async function listOverdueTodos(organizationId: string, args: Args) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("todos")
    .select("title, due_at, priority")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .not("due_at", "is", null)
    .lt("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(asInt(args.limit, 15, 1, 50));
  return (data ?? []).map((t) => ({
    title: t.title,
    priority: t.priority,
    due: t.due_at,
    days_overdue: Math.max(1, Math.floor((Date.now() - new Date(t.due_at!).getTime()) / 86_400_000)),
  }));
}

async function listUpcomingCelebrations(organizationId: string, args: Args) {
  const days = asInt(args.days, 14, 1, 60);
  const supabase = await createClient();
  const members = await fetchAll<{ id: string; first_name: string; last_name: string | null; date_of_birth: string | null; wedding_date: string | null }>((from, to) =>
    supabase.from("members").select("id, first_name, last_name, date_of_birth, wedding_date").eq("organization_id", organizationId).eq("status", "active").range(from, to),
  );
  const names = new Map(members.map((m) => [m.id, fullName(m)]));
  return upcomingCelebrations(members, todayKey(), days).map((c) => ({ name: names.get(c.memberId), kind: c.kind, date: c.date, days_away: c.daysAway }));
}

async function listNewMembers(organizationId: string, args: Args) {
  const days = asInt(args.days, 30, 1, 180);
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("members")
    .select("first_name, last_name, phone, created_at, status, branches!members_branch_id_fkey(name)")
    .eq("organization_id", organizationId)
    .neq("status", "student")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(asInt(args.limit, 25, 1, 100));
  return (data ?? []).map((m) => ({
    name: fullName(m),
    phone: m.phone,
    branch: (m.branches as { name: string } | null)?.name ?? null,
    status: m.status,
    joined: m.created_at.slice(0, 10),
  }));
}

async function findMember(organizationId: string, args: Args) {
  const name = asString(args.name);
  if (!name) return { error: "name is required." };
  const term = name.replace(/[%,()]/g, " ").trim();
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("id, first_name, last_name, phone, email, status, created_at, date_of_birth, branches!members_branch_id_fkey(name)")
    .eq("organization_id", organizationId)
    .neq("status", "student")
    .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
    .limit(5);
  if (!data || data.length === 0) return { error: `No member found matching "${name}".` };
  return Promise.all(
    data.map(async (m) => {
      const { data: last } = await supabase
        .from("attendance_records")
        .select("attendance_sessions(occurrence_date, title)")
        .eq("member_id", m.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const session = last?.attendance_sessions as { occurrence_date: string; title: string } | null;
      return {
        name: fullName(m),
        phone: m.phone,
        email: m.email,
        status: m.status,
        branch: (m.branches as { name: string } | null)?.name ?? null,
        joined: m.created_at.slice(0, 10),
        birthday: m.date_of_birth ? m.date_of_birth.slice(5) : null,
        last_attended: session ? `${session.occurrence_date} (${session.title})` : "no attendance recorded",
      };
    }),
  );
}

async function listPendingApprovals(organizationId: string) {
  const supabase = await createClient();
  const count = async (table: string, filters: Record<string, string>) => {
    let q = supabase.from(table as "members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [joining, changes, families, prayers] = await Promise.all([
    count("members", { status: "pending" }),
    count("member_profile_update_requests", { status: "pending" }),
    count("family_requests", { status: "pending" }),
    count("prayer_requests", { status: "open" }),
  ]);
  return { people_asking_to_join: joining, member_detail_changes: changes, family_requests: families, open_prayer_requests: prayers };
}

async function getChurchHealth(organizationId: string) {
  const rules = await getAiDataAccessRules(organizationId);
  const signals: Signal[] = [];
  const supabase = await createClient();
  const attempt = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      /* one area failing to load must not hide the others */
    }
  };

  if (rules.allowAttendance) {
    await attempt(async () => {
      const { sessions, roster } = await loadRecordedSessions(organizationId, 10, null);
      if (sessions.length === 0) {
        signals.push({ area: "Attendance", severity: "watch", finding: "No attendance has been recorded yet, so there is nothing to measure attendance or follow-up against.", suggestion: "Take attendance at the next service, even just a headcount." });
        return;
      }
      const days = Math.floor((Date.now() - new Date(`${sessions[0].date}T12:00:00Z`).getTime()) / 86_400_000);
      if (days > 14) signals.push({ area: "Attendance", severity: "watch", finding: `The last recorded attendance was ${days} days ago (${sessions[0].date}).`, suggestion: "Record attendance every week so trends and follow-ups stay accurate." });
      const counts = sessions.map((s) => s.attendedIds.size);
      const trend = trendOf(counts);
      if (trend) {
        const text = `Average attendance over the last ${Math.floor(counts.length / 2)} sessions is ${trend.recentAverage}, against ${trend.previousAverage} before that${trend.changePercent === null ? "" : ` (${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%)`}.`;
        signals.push({ area: "Attendance", severity: trend.direction === "down" && (trend.changePercent ?? 0) <= -15 ? "act" : trend.direction === "down" ? "watch" : "ok", finding: text, suggestion: trend.direction === "down" ? "Look at which branch or group is falling, and who stopped coming." : undefined });
      }
      const byId = new Map(roster.map((m) => [m.id, m]));
      const drifting = missedInARow(sessions, 3).filter((s) => byId.has(s.memberId));
      if (sessions.length >= 3)
        signals.push({
          area: "Members slipping away",
          severity: drifting.length === 0 ? "ok" : drifting.length >= 10 ? "act" : "watch",
          finding: drifting.length === 0 ? "Nobody has missed 3 recorded sessions in a row." : `${drifting.length} member${drifting.length === 1 ? " has" : "s have"} missed the last 3 or more sessions in a row.`,
          suggestion: drifting.length > 0 ? "Assign each a call or visit (ask me for the names)." : undefined,
        });
    });
  }

  if (rules.allowMembers) {
    await attempt(async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [{ count: active }, { count: fresh }, { count: withApp }, { count: noPhone }] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "student").gte("created_at", since),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active").not("auth_user_id", "is", null),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active").is("phone", null),
      ]);
      const total = active ?? 0;
      signals.push({ area: "New people", severity: (fresh ?? 0) === 0 && total > 0 ? "watch" : "ok", finding: `${fresh ?? 0} new member${fresh === 1 ? "" : "s"} joined in the last 30 days (${total} active in all).`, suggestion: (fresh ?? 0) === 0 ? "Consider a welcome or invite push; nobody new has been added this month." : "Make sure each new person is welcomed and followed up." });
      if (total > 0) {
        const pct = Math.round(((withApp ?? 0) / total) * 100);
        signals.push({ area: "App adoption", severity: pct < 25 ? "watch" : "ok", finding: `${withApp ?? 0} of ${total} active members (${pct}%) have signed in to the app.`, suggestion: pct < 25 ? "Share the app link at service and by WhatsApp; members in the app get notices, giving and events." : undefined });
        if ((noPhone ?? 0) > 0)
          signals.push({ area: "Records", severity: (noPhone ?? 0) / total > 0.2 ? "watch" : "ok", finding: `${noPhone} active member${noPhone === 1 ? " has" : "s have"} no phone number, so they can't be reached or sign in to the app.`, suggestion: "Collect numbers at the next service or through a form." });
      }
      const approvals = await listPendingApprovals(organizationId);
      const waiting = approvals.people_asking_to_join + approvals.member_detail_changes + approvals.family_requests;
      signals.push({ area: "Waiting for you", severity: waiting === 0 ? "ok" : waiting >= 5 ? "act" : "watch", finding: waiting === 0 ? "Nothing is waiting for approval." : `${waiting} item${waiting === 1 ? " is" : "s are"} waiting for approval (${approvals.people_asking_to_join} joining, ${approvals.member_detail_changes} detail changes, ${approvals.family_requests} families).`, suggestion: waiting > 0 ? "Clear these so members aren't left waiting." : undefined });
      const overdue = await listOverdueTodos(organizationId, { limit: 50 });
      signals.push({ area: "Tasks", severity: overdue.length === 0 ? "ok" : overdue.length >= 5 ? "act" : "watch", finding: overdue.length === 0 ? "No tasks are overdue." : `${overdue.length} task${overdue.length === 1 ? " is" : "s are"} overdue (the oldest by ${overdue[0].days_overdue} days).`, suggestion: overdue.length > 0 ? "Reassign or close them." : undefined });
      if (approvals.open_prayer_requests > 0)
        signals.push({ area: "Prayer", severity: approvals.open_prayer_requests >= 10 ? "watch" : "ok", finding: `${approvals.open_prayer_requests} prayer request${approvals.open_prayer_requests === 1 ? " is" : "s are"} still open.`, suggestion: "Pray over them in the next meeting and mark answered ones." });
    });
  }

  if (rules.allowFinance) {
    await attempt(async () => {
      const giving = (await getGivingTrend(organizationId, { months: 6 })) as { this_month_so_far: number; last_month: number; average_of_earlier_months: number; months: { total: number }[] };
      if (giving.months.every((m) => m.total === 0)) {
        signals.push({ area: "Giving", severity: "watch", finding: "No offerings or donations are recorded in the last 6 months.", suggestion: "Record each week's offering so giving trends are visible." });
      } else {
        const day = new Date().getUTCDate();
        const paceLast = giving.last_month > 0 ? Math.round((giving.this_month_so_far / giving.last_month) * 100) : null;
        const down = giving.average_of_earlier_months > 0 && giving.last_month < giving.average_of_earlier_months * 0.85;
        signals.push({ area: "Giving", severity: down ? "watch" : "ok", finding: `Last month's giving was ${Math.round(giving.last_month).toLocaleString("en-IN")} against an earlier monthly average of ${Math.round(giving.average_of_earlier_months).toLocaleString("en-IN")}; this month so far (day ${day}) is ${Math.round(giving.this_month_so_far).toLocaleString("en-IN")}${paceLast === null ? "" : `, ${paceLast}% of last month's total`}.`, suggestion: down ? "Giving dipped; a reminder about the giving page or a fundraiser update may help." : undefined });
      }
    });
  }

  if (rules.allowEvents) {
    await attempt(async () => {
      const events = await getEvents(organizationId);
      const now = new Date();
      const upcoming = getOccurrencesInRange(events, now, new Date(now.getTime() + 30 * 86_400_000));
      signals.push({ area: "Events", severity: upcoming.length === 0 ? "watch" : "ok", finding: upcoming.length === 0 ? "No events are scheduled in the next 30 days." : `${upcoming.length} event occurrence${upcoming.length === 1 ? " is" : "s are"} scheduled in the next 30 days.`, suggestion: upcoming.length === 0 ? "Plan something to bring people together: a fellowship, prayer night or outreach." : undefined });
    });
  }

  if (rules.allowMinistries) {
    await attempt(async () => {
      const ministries = await getMinistries(organizationId);
      const noLeader = ministries.filter((m) => !m.managed_by);
      signals.push({ area: "Ministries", severity: ministries.length === 0 ? "watch" : noLeader.length > 0 ? "watch" : "ok", finding: ministries.length === 0 ? "No ministries are set up." : noLeader.length === 0 ? `All ${ministries.length} ministries have a leader.` : `${noLeader.length} of ${ministries.length} ministries have no leader assigned (${noLeader.slice(0, 5).map((m) => m.title).join(", ")}).`, suggestion: noLeader.length > 0 || ministries.length === 0 ? "A ministry without a leader tends to stall; name someone." : undefined });
    });
  }

  if (rules.allowBranches) {
    await attempt(async () => {
      const branches = await getBranches(organizationId);
      const noManager = branches.filter((b) => !b.managed_by && !b.leader_name);
      if (branches.length > 0)
        signals.push({ area: "Branches", severity: noManager.length > 0 ? "watch" : "ok", finding: noManager.length === 0 ? `All ${branches.length} branches have a leader.` : `${noManager.length} of ${branches.length} branches have no leader assigned (${noManager.slice(0, 5).map((b) => b.name).join(", ")}).`, suggestion: noManager.length > 0 ? "Assign a branch leader so someone is accountable for each location." : undefined });
    });
  }

  return {
    as_of: todayKey(),
    note: "Findings are ranked most urgent first. Use the follow-up tools for names and details.",
    findings: rankSignals(signals),
  };
}

export async function executeLeadershipTool(organizationId: string, name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "get_church_health":
      return getChurchHealth(organizationId);
    case "find_members_needing_followup":
      return findMembersNeedingFollowup(organizationId, args);
    case "get_attendance_trend":
      return getAttendanceTrend(organizationId, args);
    case "get_giving_trend":
      return getGivingTrend(organizationId, args);
    case "list_overdue_todos":
      return listOverdueTodos(organizationId, args);
    case "list_upcoming_celebrations":
      return listUpcomingCelebrations(organizationId, args);
    case "list_new_members":
      return listNewMembers(organizationId, args);
    case "find_member":
      return findMember(organizationId, args);
    case "list_pending_approvals":
      return listPendingApprovals(organizationId);
    default:
      return undefined;
  }
}
