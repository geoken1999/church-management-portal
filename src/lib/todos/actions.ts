"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
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

export async function createTodo(_prevState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();

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

  const supabase = await createClient();
  await supabase.from("todos").delete().eq("id", id);

  revalidatePath(TODOS_PATH);
  revalidatePath(DASHBOARD_PATH);
}
