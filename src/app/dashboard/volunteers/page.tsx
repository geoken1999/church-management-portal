import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getVolunteers } from "@/lib/volunteers/dal";
import { VolunteersManager } from "@/components/volunteers/VolunteersManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Volunteers | KingdomFlow",
};

export default async function VolunteersPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.volunteers.read) {
    return <AccessRestricted label="Volunteers" />;
  }

  const [members, entries] = await Promise.all([getMembers(organizationId), getVolunteers(organizationId)]);

  // Pending join requests aren't approved yet, so they can't be volunteers.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name, phone: member.phone }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Volunteers</h1>
        <p className="mt-1 text-muted-foreground">
          Members who serve {membership.organization.name}. Each volunteer gets an ID number, and if they use the KingdomFlow app they see a digital volunteer ID card there.
        </p>
      </div>

      <VolunteersManager
        organizationId={organizationId}
        entries={entries}
        members={assignableMembers}
        canWrite={membership.tabAccess.volunteers.write}
        canDelete={membership.tabAccess.volunteers.delete}
      />
    </div>
  );
}
