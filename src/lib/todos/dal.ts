import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// assigned_to and created_by both reference profiles.auth_user_id, so a
// plain `profiles(...)` embed would be ambiguous — the `!fkey_name` hint
// tells PostgREST which of the two relationships each alias means.
const TODO_SELECT =
  "*, assignee:profiles!todos_assigned_to_fkey(first_name, last_name), creator:profiles!todos_created_by_fkey(first_name, last_name)";

export const getTodos = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todos")
    .select(TODO_SELECT)
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return data ?? [];
});

export interface UpcomingTodo {
  id: string;
  title: string;
  dueAt: string;
  overdue: boolean;
}

// Dashboard widget only needs pending items that actually have a
// reminder — "upcoming" implies a date, so undated to-dos aren't shown
// there even though they still appear on the full To Do page. Computes
// `overdue` here (a plain async function, not a component) rather than in
// the dashboard widget, which keeps that Server Component free of
// Date.now()-style impure calls during render.
export const getUpcomingTodos = cache(async (organizationId: string, limit = 5): Promise<UpcomingTodo[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todos")
    .select("id, title, due_at")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(limit);

  const now = Date.now();
  return (data ?? []).map((todo) => ({
    id: todo.id,
    title: todo.title,
    dueAt: todo.due_at as string,
    overdue: new Date(todo.due_at as string).getTime() < now,
  }));
});

export const getTodo = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("todos").select("*").eq("id", id).maybeSingle();
  return data;
});
