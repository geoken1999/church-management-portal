import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLeaderMembers } from "@/lib/leaders/dal";
import { getBranches } from "@/lib/branches/dal";
import { getEvents } from "@/lib/events/dal";
import { EventsManagerClient } from "@/components/events/EventsManagerClient";

export const metadata: Metadata = {
  title: "Events | KingdomFlow",
};

export default async function EventsPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  // Event managers are picked from Leaders, not the full members list —
  // see /dashboard/leaders.
  const [assignableMembers, branches, events] = await Promise.all([
    getLeaderMembers(organizationId),
    getBranches(organizationId),
    getEvents(organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Events</h1>
        <p className="mt-1 text-muted-foreground">
          The calendar and schedule for {membership.organization.name}.
        </p>
      </div>

      <EventsManagerClient
        organizationId={organizationId}
        members={assignableMembers}
        branches={branches}
        events={events}
        canManage={canManage}
      />
    </div>
  );
}
