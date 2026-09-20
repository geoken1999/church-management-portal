import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getEvents } from "@/lib/events/dal";
import { EventsManager } from "@/components/events/EventsManager";

export const metadata: Metadata = {
  title: "Events | KingdomFlow",
};

export default async function EventsPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  const [members, branches, events] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
    getEvents(organizationId),
  ]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be assigned as an event manager.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Events</h1>
        <p className="mt-1 text-muted-foreground">
          The calendar and schedule for {membership.organization.name}.
        </p>
      </div>

      <EventsManager
        organizationId={organizationId}
        members={assignableMembers}
        branches={branches}
        events={events}
        canManage={canManage}
      />
    </div>
  );
}
