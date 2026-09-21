import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getOrganizationMembers } from "@/lib/organizations/dal";
import { getTodos } from "@/lib/todos/dal";
import { TodosManager } from "@/components/todos/TodosManager";

export const metadata: Metadata = {
  title: "To Do | KingdomFlow",
};

export default async function TodosPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const [todos, teamMembers] = await Promise.all([
    getTodos(organizationId),
    getOrganizationMembers(organizationId),
  ]);

  const memberOptions = teamMembers.map((m) => ({
    authUserId: m.auth_user_id,
    name: `${m.profiles.first_name} ${m.profiles.last_name}`,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">To Do</h1>
        <p className="mt-1 text-muted-foreground">Track tasks for your team, with optional reminders.</p>
      </div>

      <TodosManager todos={todos} members={memberOptions} />
    </div>
  );
}
