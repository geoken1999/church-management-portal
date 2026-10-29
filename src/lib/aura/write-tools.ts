import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkFeatureCap } from "@/lib/plans/dal";
import { createTodoForMobile } from "@/lib/todos/mobile-service";
import { validateTodo } from "@/lib/todos/validation";
import { validatePlan, PLAN_STATUSES } from "@/lib/planner/validation";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/organizations/timezone";
import type { ToolDefinition } from "@/lib/ai/openai";
import type { PlanStatus } from "@/types/database";

// What Aura may add on a person's behalf. Each is offered only to someone who
// already has Write on that tab (the caller works that out), and each does the
// same checks as the screen it stands in for: validation and the plan's cap.
export interface AuraActor {
  userId: string;
  canWrite: { events: boolean; todos: boolean; planner: boolean };
}

type ToolArgs = Record<string, unknown>;

const DATE_TIME_NOTE = 'in the church\'s own time as "YYYY-MM-DDTHH:mm" (24-hour), e.g. 2026-11-08T10:30';

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
      },
      required: ["title"],
    },
  },
};

export function getWriteTools(actor: AuraActor | undefined): ToolDefinition[] {
  if (!actor) return [];
  return [
    ...(actor.canWrite.events ? [EVENT_TOOL] : []),
    ...(actor.canWrite.todos ? [TODO_TOOL] : []),
    ...(actor.canWrite.planner ? [PLAN_TOOL] : []),
  ];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function organizationTimezone(organizationId: string): Promise<string> {
  const { data } = await createAdminClient().from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return data?.timezone || DEFAULT_TIMEZONE;
}

async function createEvent(organizationId: string, actor: AuraActor, args: ToolArgs) {
  const title = text(args.title);
  const startAt = text(args.start_at);
  const endAt = text(args.end_at);
  const problem = !title || title.length < 2 ? "The event needs a title." : Number.isNaN(new Date(startAt).getTime()) ? "The event needs a valid start date and time." : endAt && (Number.isNaN(new Date(endAt).getTime()) || new Date(endAt) < new Date(startAt)) ? "The end time must be after the start time." : null;
  if (problem) return { error: problem };

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
      is_recurring: false,
      recurrence_frequency: null,
      recurrence_end_date: null,
      branch_id: null,
      meeting_mode: "offline",
      meeting_link: null,
      status: "active",
      venue: text(args.venue) || null,
      map_link: null,
      contact_name: null,
      contact_phone: null,
      managed_by: null,
      created_by: actor.userId,
    });
  if (error) return { error: "Couldn't add that event." };
  return { ok: true, created: "event", title, starts: startAt };
}

async function createTodo(organizationId: string, actor: AuraActor, args: ToolArgs) {
  const input = { title: text(args.title), description: text(args.description), dueAt: text(args.due_at), assignee: "", eventId: "", remindDayBefore: false, remindDueDay: false };
  const errors = validateTodo(input);
  if (errors.title || errors.dueAt) return { error: errors.title ?? errors.dueAt };
  const result = await createTodoForMobile(organizationId, actor.userId, input);
  return result.ok ? { ok: true, created: "to-do", title: input.title, due: input.dueAt || null } : { error: result.error };
}

async function createPlan(organizationId: string, actor: AuraActor, args: ToolArgs) {
  const title = text(args.title);
  const targetDate = text(args.target_date);
  const errors = validatePlan({ title, targetDate });
  if (errors.title || errors.targetDate) return { error: errors.title ?? errors.targetDate };
  const status = text(args.status);
  const { error } = await createAdminClient()
    .from("plans")
    .insert({
      organization_id: organizationId,
      title,
      notes: text(args.notes) || null,
      status: (PLAN_STATUSES.includes(status as PlanStatus) ? status : "draft") as PlanStatus,
      target_date: targetDate || null,
      created_by: actor.userId,
    });
  if (error) return { error: "Couldn't add that plan." };
  return { ok: true, created: "plan", title };
}

// undefined = not a write tool.
export async function executeWriteTool(organizationId: string, actor: AuraActor | undefined, name: string, args: ToolArgs): Promise<unknown> {
  const need = name === "create_event" ? "events" : name === "create_todo" ? "todos" : name === "create_plan" ? "planner" : null;
  if (!need) return undefined;
  if (!actor?.canWrite[need]) return { error: "You don't have permission to add that." };
  if (name === "create_event") return createEvent(organizationId, actor, args);
  if (name === "create_todo") return createTodo(organizationId, actor, args);
  return createPlan(organizationId, actor, args);
}
