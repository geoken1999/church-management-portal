import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getDonations, getFundraiserOptions } from "@/lib/finance/dal";
import { DonationsManager } from "@/components/finance/DonationsManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Donation | KingdomFlow",
};

export default async function DonationsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.donations.read) {
    return <AccessRestricted label="Donation" />;
  }

  const [donations, members, fundraisers] = await Promise.all([
    getDonations(organizationId),
    getMembers(organizationId),
    getFundraiserOptions(organizationId),
  ]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be picked as a donor.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Donation</h1>
        <p className="mt-1 text-muted-foreground">Gifts from members and outside donors.</p>
      </div>

      <DonationsManager
        organizationId={organizationId}
        donations={donations}
        members={assignableMembers}
        fundraisers={fundraisers}
        canWrite={membership.tabAccess.donations.write}
        canDelete={membership.tabAccess.donations.delete}
      />
    </div>
  );
}
