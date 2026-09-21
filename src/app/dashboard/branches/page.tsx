import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { getLeaderMembers } from "@/lib/leaders/dal";
import { BranchesManager } from "@/components/branches/BranchesManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Branches | KingdomFlow",
};

export default async function BranchesPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.branches.read) {
    return <AccessRestricted label="Branches" />;
  }

  // Branch managers are picked from Leaders, not the full members list —
  // see /dashboard/leaders.
  const [branches, leaderMembers] = await Promise.all([
    getBranches(organizationId),
    getLeaderMembers(organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Branches</h1>
        <p className="mt-1 text-muted-foreground">
          The campuses and locations {membership.organization.name} runs.
        </p>
      </div>

      <BranchesManager
        organizationId={organizationId}
        branches={branches}
        members={leaderMembers}
        canManage={canManage}
      />
    </div>
  );
}
