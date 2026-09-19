import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { BranchesManager } from "@/components/branches/BranchesManager";

export const metadata: Metadata = {
  title: "Branches | KingdomFlow",
};

export default async function BranchesPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const branches = await getBranches(membership.organization.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Branches</h1>
        <p className="mt-1 text-muted-foreground">
          The campuses and locations {membership.organization.name} runs.
        </p>
      </div>

      <BranchesManager
        organizationId={membership.organization.id}
        branches={branches}
        canManage={canManage}
      />
    </div>
  );
}
