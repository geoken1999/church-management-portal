import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkFeatureCap } from "@/lib/plans/dal";
import { createTodoForMobile } from "@/lib/todos/mobile-service";
import { validateTodo } from "@/lib/todos/validation";
import { validatePlan, validateItemTimeRange, PLAN_STATUSES } from "@/lib/planner/validation";
import { notifyMember } from "@/lib/push/member-notice";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/organizations/timezone";
import type { ToolDefinition } from "@/lib/ai/openai";
import type { PlanItem, PlanStatus } from "@/types/database";

// What Aura may add on a person's behalf. Each is offered only to someone who
// already has Write on that tab (the caller works that out), and each does the
// same checks as the screen it stands in for: validation and the plan's cap.
export interface AuraActor {
  userId: string;
  canWrite: { events: boolean; todos: boolean; planner: boolean };
}

type ToolArgs = Record<string, unknown>;

const DATE_TIME_NOTE = 'in the church\'s own time as "YYYY-MM-DDTHH:mm" (24-hour), e.g. 2026-11-08T10:30';

const PLAN_ITEM_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "What needs doing." },
    start_time: { type: "string", description: 'Time of day it starts, "HH:MM" 24-hour. Optional.' },
    end_time: { type: "string", description: 'Time of day it ends, "HH:MM" 24-hour. Optional.' },
    assignee_name: { type: "string", description: "Name of the leader it is assigned to. Optional." },
  },
  required: ["text"],
};

const EVENT_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "create_event",
    description: "Add an event to the church calendar. Only call this once you know the title and the start date and time.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_at: { type: "string", description: `When it starts, ${DATE_TIME_NOTE}.` },
        end_at: { type: "string", description: `When it ends, ${DATE_TIME_NOTE}. Optional.` },
        venue: { type: "string", description: "Where it is held. Optional." },
        description: { type: "string", description: "Optional." },
        managed_by_name: { type: "string", description: "Name of the leader in charge of the event. Optional." },
        repeats: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Only if the event repeats." },
        repeat_until: { type: "string", description: 'Last date it repeats, "YYYY-MM-DD". Optional.' },
      },
      required: ["title", "start_at"],
    },
  },
};

const TODO_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "create_todo",
    description: "Add a to-do for the team. Only call this once you know what the task is.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_at: { type: "string", description: `When it is due, ${DATE_TIME_NOTE}. Optional.` },
        description: { type: "string", description: "Optional." },
        assignee_name: { type: "string", description: "Name of the leader or team member it is assigned to. Optional." },
      },
      required: ["title"],
    },
  },
};

const PLAN_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "create_plan",
    description: "Add a plan to the Planner (for example a campaign, a project or a series). Only call this once you know the title.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string", description: "Optional." },
        status: { type: "string", enum: PLAN_STATUSES, description: "Defaults to draft." },
        target_date: { type: "string", description: 'Target date as "YYYY-MM-DD". Optional.' },
        items: {
          type: "array",
          description: "The plan's schedule or checklist steps, in order. Optional.",
          items: PLAN_ITEM_SCHEMA,
        },
      },
      required: ["title"],
    },
  },
};

const PLAN_ITEM_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_plan_item",
    description: "Add one step (optionally with a time slot and an assignee) to a plan that already exists in the Planner.",
    parameters: {
      type: "object",
      properties: { plan_title: { type: "string", description: "The title of the existing plan (or part of it)." }, ...PLAN_ITEM_SCHEMA.properties },
      required: ["plan_title", "text"],
    },
  },
};

export function getWriteTools(actor: AuraActor | undefined): ToolDefinition[] {
  if (!actor) return [];
  return [
    ...(actor.canWrite.events ? [EVENT_TOOL] : []),
    ...(actor.canWrite.todos ? [TODO_TOOL] : []),
    ...(actor.canWrite.planner ? [PLAN_TOOL, PLAN_ITEM_TOOL] : []),
  ];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function organizationTimezone(organizationId: string): Promise<string> {
  const { data } = await createAdminClient().from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return data?.timezone || DEFAULT_TIMEZONE;
}

type Person = { id: string; name: string };
type Resolved = { person: Person } | { error: string };

function pickByName<T extends Person>(people: T[], wanted: string, what: string): { person: T } | { error: string } {
  const q = wanted.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = people.filter((p) => p.name.toLowerCase() === q);
  const matches = exact.length > 0 ? exact : people.filter((p) => q.split(" ").every((part) => p.name.toLowerCase().includes(part)));
  if (matches.length === 1) return { person: matches[0] };
  if (matches.length === 0) return { error: `There is no ${what} called "${wanted}". Ask the person who they meant.` };
  return { error: `More than one ${what} matches "${wanted}": ${matches.map((m) => m.name).join(", ")}. Ask the person which one.` };
}

// Leaders are church members; the id returned is the member's id.
async function findLeader(organizationId: string, wanted: string): Promise<Resolved> {
  const { data } = await createAdminClient().from("leaders").select("member_id, members(first_name, last_name)").eq("organization_id", organizationId);
  const leaders: Person[] = (data ?? []).flatMap((l) => (l.members ? [{ id: l.member_id, name: `${l.members.first_name} ${l.members.last_name}`.trim() }] : []));
  return pickByName(leaders, wanted, "leader");
}

// Someone who logs in to the dashboard; the id returned is their auth user id.
async function findTeamMember(organizationId: string, wanted: string): Promise<Resolved> {
  const admin = createAdminClient();
  const { data: staff } = await admin.from("organization_members").select("auth_user_id").eq("organization_id", organizationId);
  const ids = (staff ?? []).map((s) => s.auth_user_id);
  if (ids.length === 0) return { error: `There is no team member called "${wanted}".` };
  const { data: profiles } = await admin.from("profiles").select("auth_user_id, first_name, last_name").in("auth_user_id", ids);
  const people: Person[] = (profiles ?? []).map((p) => ({ id: p.auth_user_id, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() }));
  return pickByName(people, wanted, "team member");
}

async function createEvent(organizationId: string, actor: AuraActor, args: ToolArgs) {
  const title = text(args.title);
  const startAt = text(args.start_at);
  const endAt = text(args.end_at);
  const repeats = text(args.repeats);
  const repeatUntil = text(args.repeat_until);
  const problem = !title || title.length < 2 ? "The event needs a title." : Number.isNaN(new Date(startAt).getTime()) ? "The event needs a valid start date and time." : endAt && (Number.isNaN(new Date(endAt).getTime()) || new Date(endAt) < new Date(startAt)) ? "The end time must be after the start time." : repeats && !["daily", "weekly", "monthly"].includes(repeats) ? "Repeats must be daily, weekly or monthly." : repeatUntil && Number.isNaN(new Date(`${repeatUntil}T00:00:00`).getTime()) ? "The repeat end date isn't valid." : null;
  if (problem) return { error: problem };

  let managedBy: Person | null = null;
  if (text(args.managed_by_name)) {
    const found = await findLeader(organizationId, text(args.managed_by_name));
    if ("error" in found) return found;
    managedBy = found.person;
  }

  const capError = await checkFeatureCap(organizationId, "events", "events");
  if (capError) return { error: capError };

  const timeZone = await organizationTimezone(organizationId);
  const { error } = await createAdminClient()
    .from("events")
    .insert({
      organization_id: organizationId,
      title,
      description: text(args.description) || null,
      start_at: zonedTimeToUtc(startAt, timeZone).toISOString(),
      end_at: endAt ? zonedTimeToUtc(endAt, timeZone).toISOString() : null,
      is_recurring: Boolean(repeats),
      recurrence_frequency: (repeats || null) as "daily" | "weekly" | "monthly" | null,
      recurrence_end_date: repeats && repeatUntil ? repeatUntil : null,
      branch_id: null,
      meeting_mode: "offline",
      meeting_link: null,
      status: "active",
      venue: text(args.venue) || null,
      map_link: null,
      contact_name: null,
      contact_phone: null,
      managed_by: managedBy?.id ?? null,
      created_by: actor.userId,
    });
  if (error) return { error: "Couldn't add that event." };
  return { ok: true, created: "event", title, starts: startAt, repeats: repeats || null, managed_by: managedBy?.name ?? null };
}

async function createTodo(organizationId: string, actor: AuraActor, args: ToolArgs) {
  let assignee = "";
  let assigneeName: string | null = null;
  if (text(args.assignee_name)) {
    const wanted = text(args.assignee_name);
    const leader = await findLeader(organizationId, wanted);
    if ("person" in leader) {
      assignee = `m:${leader.person.id}`;
      assigneeName = leader.person.name;
    } else {
      const member = await findTeamMember(organizationId, wanted);
      if ("error" in member) return { error: `${leader.error} (and no team member matches either)` };
      assignee = `u:${member.person.id}`;
      assigneeName = member.person.name;
    }
  }
  const input = { title: text(args.title), description: text(args.description), dueAt: text(args.due_at), assignee, eventId: "", remindDayBefore: false, remindDueDay: false };
  const errors = validateTodo(input);
  if (errors.title || errors.dueAt) return { error: errors.title ?? errors.dueAt };
  const result = await createTodoForMobile(organizationId, actor.userId, input);
  return result.ok ? { ok: true, created: "to-do", title: input.title, due: input.dueAt || null, assigned_to: assigneeName } : { error: result.error };
}

type RawItem = { text?: unknown; start_time?: unknown; end_time?: unknown; assignee_name?: unknown };

// Turns what Aura sent into stored plan items, or says what is wrong with them.
async function buildPlanItems(organizationId: string, raw: unknown): Promise<{ items: PlanItem[]; error?: undefined } | { error: string }> {
  const list = Array.isArray(raw) ? (raw as RawItem[]) : [];
  const items: PlanItem[] = [];
  for (const entry of list.slice(0, 50)) {
    const itemText = text(entry?.text);
    if (!itemText) continue;
    const startTime = text(entry.start_time);
    const endTime = text(entry.end_time);
    const timeError = validateItemTimeRange(startTime, endTime);
    if (timeError) return { error: `"${itemText}": ${timeError}` };
    let assignedTo: string | null = null;
    if (text(entry.assignee_name)) {
      const found = await findLeader(organizationId, text(entry.assignee_name));
      if ("error" in found) return { error: found.error };
      assignedTo = found.person.id;
    }
    items.push({ id: crypto.randomUUID(), text: itemText, done: false, startTime: startTime || null, endTime: endTime || null, assignedTo });
  }
  return { items };
}

async function notifyAssignees(planTitle: string, items: PlanItem[]) {
  for (const item of items) {
    if (item.assignedTo) await notifyMember(item.assignedTo, "New task assigned to you", `${item.text} (${planTitle})`);
  }
}

async function createPlan(organizationId: string, actor: AuraActor, args: ToolArgs) {
  const title = text(args.title);
  const targetDate = text(args.target_date);
  const errors = validatePlan({ title, targetDate });
  if (errors.title || errors.targetDate) return { error: errors.title ?? errors.targetDate };
  const built = await buildPlanItems(organizationId, args.items);
  if (built.error !== undefined) return { error: built.error };
  const status = text(args.status);
  const { error } = await createAdminClient()
    .from("plans")
    .insert({
      organization_id: organizationId,
      title,
      notes: text(args.notes) || null,
      status: (PLAN_STATUSES.includes(status as PlanStatus) ? status : "draft") as PlanStatus,
      target_date: targetDate || null,
      items: built.items,
      created_by: actor.userId,
    });
  if (error) return { error: "Couldn't add that plan." };
  await notifyAssignees(title, built.items);
  return { ok: true, created: "plan", title, steps: built.items.length };
}

async function addPlanItem(organizationId: string, args: ToolArgs) {
  const wanted = text(args.plan_title).toLowerCase();
  if (!wanted) return { error: "Which plan should it go in?" };
  const admin = createAdminClient();
  const { data: plans } = await admin.from("plans").select("id, title, items").eq("organization_id", organizationId);
  const found = pickByName((plans ?? []).map((p) => ({ id: p.id, name: p.title })), wanted, "plan");
  if ("error" in found) return found;
  const built = await buildPlanItems(organizationId, [args]);
  if (built.error !== undefined) return { error: built.error };
  if (built.items.length === 0) return { error: "What should the step say?" };
  const plan = (plans ?? []).find((p) => p.id === found.person.id)!;
  const { error } = await admin
    .from("plans")
    .update({ items: [...(plan.items ?? []), ...built.items] })
    .eq("id", plan.id);
  if (error) return { error: "Couldn't add that step." };
  await notifyAssignees(plan.title, built.items);
  return { ok: true, created: "plan step", plan: plan.title, text: built.items[0].text };
}

// undefined = not a write tool.
export async function executeWriteTool(organizationId: string, actor: AuraActor | undefined, name: string, args: ToolArgs): Promise<unknown> {
  const need = name === "create_event" ? "events" : name === "create_todo" ? "todos" : name === "create_plan" || name === "add_plan_item" ? "planner" : null;
  if (!need) return undefined;
  if (!actor?.canWrite[need]) return { error: "You don't have permission to add that." };
  if (name === "create_event") return createEvent(organizationId, actor, args);
  if (name === "create_todo") return createTodo(organizationId, actor, args);
  if (name === "add_plan_item") return addPlanItem(organizationId, args);
  return createPlan(organizationId, actor, args);
}
