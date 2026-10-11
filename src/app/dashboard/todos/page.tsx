import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getOrganizationMembers } from "@/lib/organizations/dal";
import { getTodos, getTodoEvents } from "@/lib/todos/dal";
import { getLeaders } from "@/lib/leaders/dal";
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

  const [todos, teamMembers, todoEvents, leaders] = await Promise.all([
    getTodos(organizationId),
    getOrganizationMembers(organizationId),
    getTodoEvents(organizationId),
    getLeaders(organizationId),
  ]);

  // Who a to-do can go to: leaders (church members, picked up the moment
  // they are added as a leader) and team members who log in to the dashboard.
  const memberOptions = [
    ...leaders
      .filter((l) => l.members)
      .map((l) => ({ value: `m:${l.member_id}`, name: `${l.members?.first_name} ${l.members?.last_name}`, group: "Leaders" as const })),
    ...teamMembers.map((m) => ({
      value: `u:${m.auth_user_id}`,
      name: `${m.profiles.first_name} ${m.profiles.last_name}`,
      group: "Team" as const,
    })),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">To Do</h1>
        <p className="mt-1 text-muted-foreground">Track tasks for your team, with optional reminders. Add an event, like a camp, and keep its tasks together inside it.</p>
      </div>

      <TodosManager todos={todos} members={memberOptions} events={todoEvents.map((e) => ({ id: e.id, title: e.title, eventDate: e.event_date }))} canWrite={membership.tabAccess.todos.write} canDelete={membership.tabAccess.todos.delete} timezone={membership.organization.timezone} />
    </div>
  );
}
