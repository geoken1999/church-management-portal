import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { getLeaderMembers } from "@/lib/leaders/dal";
import { getFundraisers } from "@/lib/finance/dal";
import { FundraisersManager } from "@/components/finance/FundraisersManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Fund Raiser | KingdomFlow",
};

export default async function FundraisersPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.fundraisers.read) {
    return <AccessRestricted label="Fund Raiser" />;
  }

  const [fundraisers, branches, leaderMembers] = await Promise.all([
    getFundraisers(organizationId),
    getBranches(organizationId),
    getLeaderMembers(organizationId),
  ]);

  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Fund Raiser</h1>
        <p className="mt-1 text-muted-foreground">
          Campaigns {membership.organization.name} is running toward a goal.
        </p>
      </div>

      <FundraisersManager
        organizationId={organizationId}
        fundraisers={fundraisers}
        branches={branchOptions}
        members={leaderMembers}
        canWrite={membership.tabAccess.fundraisers.write}
        canDelete={membership.tabAccess.fundraisers.delete}
      />
    </div>
  );
}
