import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getCommitteeMembers } from "@/lib/committee/dal";
import { CommitteeManager } from "@/components/committee/CommitteeManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Committee | KingdomFlow",
};

export default async function CommitteePage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.committee.read) {
    return <AccessRestricted label="Committee" />;
  }

  const [members, entries] = await Promise.all([getMembers(organizationId), getCommitteeMembers(organizationId)]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be assigned to a committee.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name, phone: member.phone }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Committee</h1>
        <p className="mt-1 text-muted-foreground">Members serving on {membership.organization.name}&apos;s committees.</p>
      </div>

      <CommitteeManager
        organizationId={organizationId}
        entries={entries}
        members={assignableMembers}
        canWrite={membership.tabAccess.committee.write}
        canDelete={membership.tabAccess.committee.delete}
      />
    </div>
  );
}
