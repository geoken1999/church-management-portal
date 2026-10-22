import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getFamilies, getPendingFamilyRequests } from "@/lib/families/dal";
import { LiveRefresh } from "@/components/LiveRefresh";
import { FamilyRequestsCard } from "@/components/families/FamilyRequestsCard";
import { FamiliesManager } from "@/components/families/FamiliesManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Families | KingdomFlow",
};

export default async function FamiliesPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.families.read) {
    return <AccessRestricted label="Families" />;
  }

  const [members, families, requests] = await Promise.all([
    getMembers(organizationId),
    getFamilies(organizationId),
    getPendingFamilyRequests(organizationId),
  ]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be assigned to a family.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name, phone: member.phone }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Families</h1>
        <p className="mt-1 text-muted-foreground">Group {membership.organization.name}&apos;s congregation into household/family units.</p>
      </div>

      <LiveRefresh tables={["family_requests", "families", "family_members"]} organizationId={organizationId} />

      <FamilyRequestsCard
        requests={requests}
        members={assignableMembers}
        canReview={membership.role === "owner" || membership.role === "admin"}
      />

      <FamiliesManager
        organizationId={organizationId}
        families={families}
        members={assignableMembers}
        canWrite={membership.tabAccess.families.write}
        canDelete={membership.tabAccess.families.delete}
      />
    </div>
  );
}
