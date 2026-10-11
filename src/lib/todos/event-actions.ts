"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";

const TODOS_PATH = "/dashboard/todos";

export interface TodoEventResult {
  error?: string;
  success?: boolean;
  id?: string;
}

function parseTitle(raw: string): { title: string; error?: undefined } | { title?: undefined; error: string } {
  const title = raw.trim();
  if (title.length < 2) return { error: "Give the event a name (at least 2 characters)." };
  if (title.length > 80) return { error: "Keep the event name under 80 characters." };
  return { title };
}

function parseDate(raw: string): { date: string | null; error?: undefined } | { date?: undefined; error: string } {
  const value = raw.trim();
  if (!value) return { date: null };
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? { date: value } : { error: "That date isn't valid." };
}

// A to-do event is a group inside To Do (a camp, a conference): a name and an
// optional date. Anyone who can write To Do can add one, rename it or remove
// it, the same as for to-dos themselves.
export async function createTodoEventAction(title: string, eventDate: string): Promise<TodoEventResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.todos.write) return { error: "You don't have permission to add events." };

  const { title: cleanTitle, error: titleError } = parseTitle(title);
  if (titleError || cleanTitle === undefined) return { error: titleError ?? "Give the event a name." };
  const { date: cleanDate, error: dateError } = parseDate(eventDate);
  if (dateError || cleanDate === undefined) return { error: dateError ?? "That date isn't valid." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todo_events")
    .insert({ organization_id: membership.organization.id, title: cleanTitle, event_date: cleanDate, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add that event. Please try again." };

  revalidatePath(TODOS_PATH);
  return { success: true, id: data.id };
}

export async function updateTodoEventAction(id: string, title: string, eventDate: string): Promise<TodoEventResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.todos.write) return { error: "You don't have permission to edit events." };

  const { title: cleanTitle, error: titleError } = parseTitle(title);
  if (titleError || cleanTitle === undefined) return { error: titleError ?? "Give the event a name." };
  const { date: cleanDate, error: dateError } = parseDate(eventDate);
  if (dateError || cleanDate === undefined) return { error: dateError ?? "That date isn't valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("todo_events")
    .update({ title: cleanTitle, event_date: cleanDate })
    .eq("id", id)
    .eq("organization_id", membership.organization.id);
  if (error) return { error: "Couldn't save those changes. Please try again." };

  revalidatePath(TODOS_PATH);
  return { success: true };
}

// The event goes; its to-dos stay, as ordinary ones.
export async function deleteTodoEventAction(id: string): Promise<TodoEventResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.todos.delete) return { error: "You don't have permission to delete events." };

  const supabase = await createClient();
  const { error } = await supabase.from("todo_events").delete().eq("id", id).eq("organization_id", membership.organization.id);
  if (error) return { error: "Couldn't delete that event. Please try again." };

  revalidatePath(TODOS_PATH);
  return { success: true };
}
