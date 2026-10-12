import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgFeatureState } from "@/lib/plans/dal";
import { validateTodo } from "@/lib/todos/validation";
import { parseAssignee } from "@/lib/todos/assignee";
import { sendPushToUsers } from "@/lib/push/client";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/organizations/timezone";

// The staff mobile app's To-do changes. The same rules as the web's server
// actions (src/lib/todos/actions.ts), for a bearer-token caller: who may do it
// has already been checked by the route.

export interface TodoInput {
  title: string;
  description: string;
  dueAt: string; // "YYYY-MM-DDTHH:mm" in the church's own time, or ""
  assignee: string; // "u:<auth user id>", "m:<leader member id>", or ""
  eventId: string;
  remindDayBefore: boolean;
  remindDueDay: boolean;
}

export type ServiceResult = { ok: true } | { ok: false; error: string };

async function organizationTimezone(organizationId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return data?.timezone || DEFAULT_TIMEZONE;
}

type ResolvedAssignee = { error: string } | { assigned_to: string | null; assigned_member_id: string | null; pushTarget: string | null };

async function resolveAssignee(organizationId: string, raw: string): Promise<ResolvedAssignee> {
  const choice = parseAssignee(raw);
  if (!choice) return { error: "That assignee isn't valid." };
  if (choice.kind === "none") return { assigned_to: null, assigned_member_id: null, pushTarget: null };

  const admin = createAdminClient();
  if (choice.kind === "user") {
    const { data: staff } = await admin.from("organization_members").select("auth_user_id").eq("organization_id", organizationId).eq("auth_user_id", choice.id).maybeSingle();
    if (!staff) return { error: "That team member could not be found." };
    return { assigned_to: choice.id, assigned_member_id: null, pushTarget: choice.id };
  }
  const { data: leader } = await admin
    .from("leaders")
    .select("member_id, members(auth_user_id)")
    .eq("organization_id", organizationId)
    .eq("member_id", choice.id)
    .maybeSingle();
  if (!leader) return { error: "That leader could not be found." };
  return { assigned_to: null, assigned_member_id: choice.id, pushTarget: leader.members?.auth_user_id ?? null };
}

async function resolveEvent(organizationId: string, eventId: string): Promise<{ title: string } | null | undefined> {
  if (!eventId) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("todo_events").select("title").eq("id", eventId).eq("organization_id", organizationId).maybeSingle();
  return data ? { title: data.title } : undefined;
}

export async function organizationIdForTodo(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("todos").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function createTodoForMobile(organizationId: string, userId: string, input: TodoInput): Promise<ServiceResult> {
  const admin = createAdminClient();

  const { featureCaps } = await getOrgFeatureState(organizationId);
  const cap = featureCaps.todos ?? null;
  if (cap !== null) {
    const { count } = await admin.from("todos").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    if ((count ?? 0) >= cap) return { ok: false, error: `This church's plan allows up to ${cap} to-dos. Remove one or contact us to raise the limit.` };
  }

  const fieldErrors = validateTodo(input);
  const firstError = fieldErrors.title ?? fieldErrors.dueAt;
  if (firstError) return { ok: false, error: firstError };

  const event = await resolveEvent(organizationId, input.eventId);
  if (event === undefined) return { ok: false, error: "That event could not be found." };
  const assignee = await resolveAssignee(organizationId, input.assignee);
  if ("error" in assignee) return { ok: false, error: assignee.error };

  const timeZone = await organizationTimezone(organizationId);
  const { error } = await admin.from("todos").insert({
    organization_id: organizationId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    due_at: input.dueAt ? zonedTimeToUtc(input.dueAt, timeZone).toISOString() : null,
    assigned_to: assignee.assigned_to,
    assigned_member_id: assignee.assigned_member_id,
    todo_event_id: input.eventId || null,
    remind_day_before: input.remindDayBefore,
    remind_due_day: input.remindDueDay,
    created_by: userId,
  });
  if (error) return { ok: false, error: "Couldn't add that to-do. Please try again." };

  if (assignee.pushTarget && assignee.pushTarget !== userId) {
    await sendPushToUsers([assignee.pushTarget], "todo_assigned", {
      title: event ? `New to-do for ${event.title}` : "New to-do assigned to you",
      body: input.title.trim(),
      data: { type: "todo_assigned" },
    });
  }
  return { ok: true };
}

export async function updateTodoForMobile(organizationId: string, userId: string, id: string, input: TodoInput): Promise<ServiceResult> {
  const admin = createAdminClient();

  const fieldErrors = validateTodo(input);
  const firstError = fieldErrors.title ?? fieldErrors.dueAt;
  if (firstError) return { ok: false, error: firstError };

  const event = await resolveEvent(organizationId, input.eventId);
  if (event === undefined) return { ok: false, error: "That event could not be found." };
  const assignee = await resolveAssignee(organizationId, input.assignee);
  if ("error" in assignee) return { ok: false, error: assignee.error };

  // Only a change TO a new assignee notifies them; re-saving the same one doesn't.
  const { data: existing } = await admin.from("todos").select("assigned_to, assigned_member_id").eq("id", id).maybeSingle();
  const unchanged = (existing?.assigned_to ?? null) === assignee.assigned_to && (existing?.assigned_member_id ?? null) === assignee.assigned_member_id;

  const timeZone = await organizationTimezone(organizationId);
  const { error } = await admin
    .from("todos")
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      due_at: input.dueAt ? zonedTimeToUtc(input.dueAt, timeZone).toISOString() : null,
      assigned_to: assignee.assigned_to,
      assigned_member_id: assignee.assigned_member_id,
      todo_event_id: input.eventId || null,
      remind_day_before: input.remindDayBefore,
      remind_due_day: input.remindDueDay,
      day_before_sent_at: null,
      last_reminder_sent_at: null,
    })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) return { ok: false, error: "Couldn't save those changes. Please try again." };

  if (assignee.pushTarget && !unchanged && assignee.pushTarget !== userId) {
    await sendPushToUsers([assignee.pushTarget], "todo_assigned", {
      title: event ? `New to-do for ${event.title}` : "New to-do assigned to you",
      body: input.title.trim(),
      data: { type: "todo_assigned" },
    });
  }
  return { ok: true };
}

export async function setTodoDoneForMobile(organizationId: string, id: string, done: boolean): Promise<ServiceResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("todos")
    .update({ status: done ? "completed" : "pending", completed_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("organization_id", organizationId);
  return error ? { ok: false, error: "Couldn't update that to-do." } : { ok: true };
}

export async function deleteTodoForMobile(organizationId: string, id: string): Promise<ServiceResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("todos").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? { ok: false, error: "Couldn't delete that to-do." } : { ok: true };
}
