import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getOrganizationMembers } from "@/lib/organizations/dal";
import { getTodos } from "@/lib/todos/dal";
import { createClient } from "@/lib/supabase/server";
import { TodosManager } from "@/components/todos/TodosManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "To Do | KingdomFlow",
};

export default async function TodosPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.todos.read) {
    return <AccessRestricted label="To Do" />;
  }

  const supabase = await createClient();
  const [todos, teamMembers, { data: events }] = await Promise.all([
    getTodos(organizationId),
    getOrganizationMembers(organizationId),
    // Cancelled events can't have new to-dos added; ones already linked still show.
    supabase.from("events").select("id, title, start_at, status").eq("organization_id", organizationId).order("start_at", { ascending: false }).limit(200),
  ]);

  const memberOptions = teamMembers.map((m) => ({
    authUserId: m.auth_user_id,
    name: `${m.profiles.first_name} ${m.profiles.last_name}`,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">To Do</h1>
        <p className="mt-1 text-muted-foreground">Track tasks for your team, with optional reminders. Link a to-do to an event, like a camp, to keep its tasks together.</p>
      </div>

      <TodosManager todos={todos} members={memberOptions} events={(events ?? []).filter((e) => e.status !== "cancelled" || todos.some((t) => t.event_id === e.id)).map((e) => ({ id: e.id, title: e.title, startAt: e.start_at }))} timezone={membership.organization.timezone} />
    </div>
  );
}
