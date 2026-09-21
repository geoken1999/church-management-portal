"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateTodo, type TodoFieldErrors } from "@/lib/todos/validation";

const TODOS_PATH = "/dashboard/todos";
const DASHBOARD_PATH = "/dashboard";

function readTodoFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    dueAt: String(formData.get("dueAt") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
  };
}

export interface TodoFormState {
  error?: string;
  fieldErrors?: TodoFieldErrors;
  success?: boolean;
}

// updateTodo/toggleTodoStatus/deleteTodo forms only carry the todo id, not
// organizationId — looked up from the record itself before a permission
// check is possible.
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

  const fields = readTodoFields(formData);
  const fieldErrors = validateTodo(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("todos").insert({
    organization_id: membership.organization.id,
    title: fields.title,
    description: fields.description || null,
    due_at: fields.dueAt ? new Date(fields.dueAt).toISOString() : null,
    assigned_to: fields.assignedTo || null,
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't add that to-do. Please try again." };
  }

  revalidatePath(TODOS_PATH);
  revalidatePath(DASHBOARD_PATH);
  return { success: true };
}

export async function updateTodo(_prevState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  await requireUser();
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("todos")
    .update({
      title: fields.title,
      description: fields.description || null,
      due_at: fields.dueAt ? new Date(fields.dueAt).toISOString() : null,
      assigned_to: fields.assignedTo || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
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
