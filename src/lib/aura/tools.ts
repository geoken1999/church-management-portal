import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAttendanceSessions, getAttendanceSession, getAttendanceRecords, getAttendanceRoster } from "@/lib/attendance/dal";
import { getEvents } from "@/lib/events/dal";
import { getOccurrencesInRange } from "@/lib/events/recurrence";
import { getFinanceOverviewStats, getFundraisers } from "@/lib/finance/dal";
import { getMinistries } from "@/lib/ministries/dal";
import { getBranches } from "@/lib/branches/dal";
import { getForms } from "@/lib/forms/dal";
import { getAiDataAccessRules, type AiDataAccessRules } from "@/lib/ai-rules/dal";
import type { ToolDefinition } from "@/lib/ai/openai";

// Every tool below runs with the session-scoped client (not the admin
// client) and takes organizationId from the already-authorized caller
// (see aura/actions.ts) — so Aura only ever sees what the person chatting
// with it could already see themselves through the normal RLS-governed
// reads every other page in this app uses. That's a deliberate, simpler
// trust boundary than the Instagram DM AI's (which talks to anonymous
// members of the public and so is hand-restricted to non-personal data) —
// Aura talks only to a logged-in team member, reusing the data access they
// already have.

// Which AI Rules category gates each tool — checked twice: getAuraTools
// below filters the list offered to the model in the first place (so a
// disabled category is never even known to exist, not just refused), and
// executeAuraTool checks again defensively before actually running one,
// in case the model was mid-conversation when an admin flipped a toggle.
const TOOL_CATEGORY: Record<string, keyof AiDataAccessRules> = {
  list_attendance_sessions: "allowAttendance",
  get_attendance_detail: "allowAttendance",
  list_upcoming_events: "allowEvents",
  get_member_count: "allowMembers",
  get_finance_summary: "allowFinance",
  list_fundraisers: "allowFundraisers",
  list_ministries: "allowMinistries",
  list_branches: "allowBranches",
  list_forms: "allowForms",
};

const AURA_TOOLS_BASE: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_attendance_sessions",
      description: "List the organization's most recent attendance-taking sessions (service/event check-ins), newest first.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max sessions to return. Defaults to 10." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance_detail",
      description:
        "Get the full attendance breakdown for one session: how many were expected, how many attended, how many missed it, and both lists of names. Use list_attendance_sessions first to find the session_id.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "The attendance session's id." },
        },
        required: ["session_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_upcoming_events",
      description: "List upcoming events (including the next occurrence of recurring ones) within a given number of days from now.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", description: "How many days ahead to look. Defaults to 30." },
          limit: { type: "integer", description: "Max events to return. Defaults to 10." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_member_count",
      description: "Count members, optionally filtered by status (active/left/pending) and/or branch name.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "left", "pending", "all"], description: "Defaults to active." },
          branch_name: { type: "string", description: "Filter to a specific branch by name (partial match). Omit for all branches." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_finance_summary",
      description: "Get this month's offerings and donations totals, plus active fundraiser count/raised/goal amounts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_fundraisers",
      description: "List fundraisers with their goal and amount raised so far.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "completed", "cancelled", "all"], description: "Defaults to active." },
          limit: { type: "integer", description: "Max fundraisers to return. Defaults to 10." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_ministries",
      description: "List the organization's ministries with their type, who manages them, and their vision/mission statements.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max ministries to return. Defaults to 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_branches",
      description: "List the organization's branches with their location, member count, and leader's contact info.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max branches to return. Defaults to 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_forms",
      description: "List the organization's custom forms with their status and response counts.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "published", "closed", "all"], description: "Defaults to published." },
          limit: { type: "integer", description: "Max forms to return. Defaults to 20." },
        },
      },
    },
  },
];

export async function getAuraTools(organizationId: string): Promise<ToolDefinition[]> {
  const rules = await getAiDataAccessRules(organizationId);
  return AURA_TOOLS_BASE.filter((tool) => rules[TOOL_CATEGORY[tool.function.name]]);
}

type ToolArgs = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function listAttendanceSessions(organizationId: string, args: ToolArgs) {
  const limit = asInt(args.limit, 10);
  const sessions = await getAttendanceSessions(organizationId);
  return sessions.slice(0, limit).map((s) => ({
    session_id: s.id,
    title: s.title,
    date: s.occurrence_date,
    branch: s.branches?.name ?? null,
    event: s.events?.title ?? null,
    attended_count: Array.isArray(s.attendance_records) ? (s.attendance_records[0]?.count ?? 0) : 0,
  }));
}

async function getAttendanceDetail(organizationId: string, args: ToolArgs) {
  const sessionId = asString(args.session_id);
  if (!sessionId) return { error: "session_id is required." };

  const session = await getAttendanceSession(organizationId, sessionId);
  if (!session) return { error: "No attendance session found with that id." };

  const [roster, attendedIds] = await Promise.all([
    getAttendanceRoster(organizationId, session.branch_id),
    getAttendanceRecords(sessionId),
  ]);

  const attendedSet = new Set(attendedIds);
  const attended = roster.filter((m) => attendedSet.has(m.id));
  const missed = roster.filter((m) => !attendedSet.has(m.id));

  return {
    session_title: session.title,
    date: session.occurrence_date,
    branch: session.branches?.name ?? "all branches",
    expected_count: roster.length,
    attended_count: attended.length,
    missed_count: missed.length,
    attended_names: attended.map((m) => `${m.first_name} ${m.last_name}`),
    missed_names: missed.map((m) => `${m.first_name} ${m.last_name}`),
  };
}

async function listUpcomingEvents(organizationId: string, args: ToolArgs) {
  const days = asInt(args.days, 30);
  const limit = asInt(args.limit, 10);
  const events = await getEvents(organizationId);
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const occurrences = getOccurrencesInRange(events, now, horizon).slice(0, limit);

  return occurrences.map(({ event, date }) => ({
    title: event.title,
    date: date.toISOString(),
    venue: event.meeting_mode === "online" ? "online" : event.venue,
    branch: event.branches?.name ?? null,
  }));
}

async function getMemberCount(organizationId: string, args: ToolArgs) {
  const supabase = await createClient();
  const branchName = asString(args.branch_name);
  const status = asString(args.status);

  let branchId: string | null = null;
  if (branchName) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", organizationId)
      .ilike("name", `%${branchName}%`)
      .maybeSingle();
    if (!branch) return { error: `No branch found matching "${branchName}".` };
    branchId = branch.id;
  }

  let query = supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (branchId) query = query.eq("branch_id", branchId);
  if (status === "active" || status === "left" || status === "pending") query = query.eq("status", status);

  const { count } = await query;
  return { count: count ?? 0, status: status ?? "active", branch: branchName ?? "all branches" };
}

async function getFinanceSummary(organizationId: string) {
  return getFinanceOverviewStats(organizationId);
}

async function listFundraisers(organizationId: string, args: ToolArgs) {
  const status = asString(args.status) ?? "active";
  const limit = asInt(args.limit, 10);
  const fundraisers = await getFundraisers(organizationId);
  const filtered = status === "all" ? fundraisers : fundraisers.filter((f) => f.status === status);

  return filtered.slice(0, limit).map((f) => ({
    title: f.title,
    status: f.status,
    goal_amount: f.goal_amount,
    raised_amount: f.raisedAmount,
    start_date: f.start_date,
    end_date: f.end_date,
  }));
}

async function listMinistries(organizationId: string, args: ToolArgs) {
  const limit = asInt(args.limit, 20);
  const ministries = await getMinistries(organizationId);
  return ministries.slice(0, limit).map((m) => ({
    title: m.title,
    type: m.type,
    managed_by: m.members ? `${m.members.first_name} ${m.members.last_name}` : null,
    vision: m.vision,
    mission: m.mission,
  }));
}

async function listBranches(organizationId: string, args: ToolArgs) {
  const limit = asInt(args.limit, 20);
  const branches = await getBranches(organizationId);
  return branches.slice(0, limit).map((b) => ({
    name: b.name,
    location: b.location,
    member_count: b.member_count,
    leader_name: b.leader_name,
    leader_phone: b.leader_phone,
  }));
}

async function listForms(organizationId: string, args: ToolArgs) {
  const status = asString(args.status) ?? "published";
  const limit = asInt(args.limit, 20);
  const forms = await getForms(organizationId);
  const filtered = status === "all" ? forms : forms.filter((f) => f.status === status);

  return filtered.slice(0, limit).map((f) => ({
    title: f.title,
    description: f.description,
    status: f.status,
    response_count: f.responseCount,
  }));
}

export async function executeAuraTool(organizationId: string, name: string, args: ToolArgs): Promise<unknown> {
  const category = TOOL_CATEGORY[name];
  if (category) {
    const rules = await getAiDataAccessRules(organizationId);
    if (!rules[category]) {
      return { error: "This data category has been turned off in AI Rules for this organization." };
    }
  }

  switch (name) {
    case "list_attendance_sessions":
      return listAttendanceSessions(organizationId, args);
    case "get_attendance_detail":
      return getAttendanceDetail(organizationId, args);
    case "list_upcoming_events":
      return listUpcomingEvents(organizationId, args);
    case "get_member_count":
      return getMemberCount(organizationId, args);
    case "get_finance_summary":
      return getFinanceSummary(organizationId);
    case "list_fundraisers":
      return listFundraisers(organizationId, args);
    case "list_ministries":
      return listMinistries(organizationId, args);
    case "list_branches":
      return listBranches(organizationId, args);
    case "list_forms":
      return listForms(organizationId, args);
    default:
      return { error: `Unknown tool "${name}".` };
  }
}
