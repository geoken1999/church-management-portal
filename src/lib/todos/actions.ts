"use server";

import { revalidatePath } from "next/cache";
import { checkFeatureCap } from "@/lib/plans/dal";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateTodo, type TodoFieldErrors } from "@/lib/todos/validation";
import { parseAssignee } from "@/lib/todos/assignee";
import { sendPushToUsers } from "@/lib/push/client";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/organizations/timezone";

const TODOS_PATH = "/dashboard/todos";
const DASHBOARD_PATH = "/dashboard";

function readTodoFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    dueAt: String(formData.get("dueAt") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    eventId: String(formData.get("eventId") ?? "").trim(),
    remindDayBefore: formData.get("remindDayBefore") === "on",
    remindDueDay: formData.get("remindDueDay") === "on",
  };
}

// The to-do event a to-do belongs to must be one of this church's own;
// returns its title (for notifications), null for none, or undefined if invalid.
async function resolveEvent(organizationId: string, eventId: string): Promise<{ title: string } | null | undefined> {
  if (!eventId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("todo_events").select("title").eq("id", eventId).eq("organization_id", organizationId).maybeSingle();
  return data ? { title: data.title } : undefined;
}

// The form's date and time have no timezone. They mean the church's local
// time, so they're read in the organization's timezone, not the server's.
async function timezoneForOrganization(organizationId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return data?.timezone ?? null;
}

function dueAtFromForm(dueAt: string, timeZone: string): string | null {
  return dueAt ? zonedTimeToUtc(dueAt, timeZone).toISOString() : null;
}

export interface TodoFormState {
  error?: string;
  fieldErrors?: TodoFieldErrors;
  success?: boolean;
}

// updateTodo/toggleTodoStatus/deleteTodo forms only carry the todo id, not
// organizationId — looked up from the record itself before a permission
// check is possible.
interface ResolvedAssignee {
  assigned_to: string | null;
  assigned_member_id: string | null;
  // Who to push to: a team member's own login, or a leader's mobile login if
  // they have signed in to the app.
  pushTarget: string | null;
}

// Turns the form's assignee choice into the columns to save. A leader must
// really be a leader of this church (the dropdown only offers them, but the
// request is checked, not trusted).
async function resolveAssignee(organizationId: string, raw: string): Promise<ResolvedAssignee | { error: string }> {
  const choice = parseAssignee(raw);
  if (!choice) return { error: "That assignee isn't valid." };
  if (choice.kind === "none") return { assigned_to: null, assigned_member_id: null, pushTarget: null };
  if (choice.kind === "user") return { assigned_to: choice.id, assigned_member_id: null, pushTarget: choice.id };

  const supabase = await createClient();
  const { data: leader } = await supabase
    .from("leaders")
    .select("member_id, members(auth_user_id)")
    .eq("organization_id", organizationId)
    .eq("member_id", choice.id)
    .maybeSingle();
  if (!leader) return { error: "That leader could not be found." };
  return { assigned_to: null, assigned_member_id: choice.id, pushTarget: leader.members?.auth_user_id ?? null };
}

async function organizationIdForTodo(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("todos").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

export async function createTodo(_prevState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();

  if (!membership.tabAccess.todos.write) {
    return { error: "You don't have permission to create to-dos." };
  }

  const capError = await checkFeatureCap(membership.organization.id, "todos", "todos");
  if (capError) return { error: capError };

  const fields = readTodoFields(formData);
  const fieldErrors = validateTodo(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const event = await resolveEvent(membership.organization.id, fields.eventId);
  if (event === undefined) return { error: "That event could not be found." };

  const assignee = await resolveAssignee(membership.organization.id, fields.assignedTo);
  if ("error" in assignee) return { error: assignee.error };

  const supabase = await createClient();
  const { error } = await supabase.from("todos").insert({
    organization_id: membership.organization.id,
    title: fields.title,
    description: fields.description || null,
    due_at: dueAtFromForm(fields.dueAt, membership.organization.timezone),
    assigned_to: assignee.assigned_to,
    assigned_member_id: assignee.assigned_member_id,
    todo_event_id: fields.eventId || null,
    remind_day_before: fields.remindDayBefore,
    remind_due_day: fields.remindDueDay,
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't add that to-do. Please try again." };
  }

  if (assignee.pushTarget && assignee.pushTarget !== user.id) {
    await sendPushToUsers([assignee.pushTarget], "todo_assigned", {
      title: event ? `New to-do for ${event.title}` : "New to-do assigned to you",
      body: fields.title,
      data: { type: "todo_assigned" },
    });
  }

  revalidatePath(TODOS_PATH);
  revalidatePath(DASHBOARD_PATH);
  return { success: true };
}

export async function updateTodo(_prevState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForTodo(id);
  if (!organizationId) {
    return { error: "That to-do could not be found." };
  }
  const access = await checkTabAccess(organizationId, "todos", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readTodoFields(formData);
  const fieldErrors = validateTodo(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const timeZone = (await timezoneForOrganization(organizationId)) ?? DEFAULT_TIMEZONE;

  const event = await resolveEvent(organizationId, fields.eventId);
  if (event === undefined) return { error: "That event could not be found." };

  const assignee = await resolveAssignee(organizationId, fields.assignedTo);
  if ("error" in assignee) return { error: assignee.error };

  const supabase = await createClient();

  // Read the previous assignee first — only a change TO a new assignee
  // should notify; re-saving the same assignment on every edit would spam
  // them.
  const { data: existing } = await supabase.from("todos").select("assigned_to, assigned_member_id").eq("id", id).maybeSingle();
  const unchangedAssignee = (existing?.assigned_to ?? null) === assignee.assigned_to && (existing?.assigned_member_id ?? null) === assignee.assigned_member_id;

  const { error } = await supabase
    .from("todos")
    .update({
      title: fields.title,
      description: fields.description || null,
      due_at: dueAtFromForm(fields.dueAt, timeZone),
      assigned_to: assignee.assigned_to,
      assigned_member_id: assignee.assigned_member_id,
      todo_event_id: fields.eventId || null,
      remind_day_before: fields.remindDayBefore,
      remind_due_day: fields.remindDueDay,
      // A new due date starts the reminders afresh.
      day_before_sent_at: null,
      last_reminder_sent_at: null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  if (assignee.pushTarget && !unchangedAssignee && assignee.pushTarget !== user.id) {
    await sendPushToUsers([assignee.pushTarget], "todo_assigned", {
      title: event ? `New to-do for ${event.title}` : "New to-do assigned to you",
      body: fields.title,
      data: { type: "todo_assigned" },
    });
  }

  revalidatePath(TODOS_PATH);
  revalidatePath(DASHBOARD_PATH);
  return { success: true };
}

export async function toggleTodoStatus(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const nextStatus = formData.get("status") === "completed" ? "completed" : "pending";

  const organizationId = await organizationIdForTodo(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "todos", "write");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  revalidatePath(TODOS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function deleteTodo(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForTodo(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "todos", "delete");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase.from("todos").delete().eq("id", id);

  revalidatePath(TODOS_PATH);
  revalidatePath(DASHBOARD_PATH);
}
