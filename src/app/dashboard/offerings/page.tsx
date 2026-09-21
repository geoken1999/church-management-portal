import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getBranches } from "@/lib/branches/dal";
import { getOfferings } from "@/lib/finance/dal";
import { OfferingsManager } from "@/components/finance/OfferingsManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Offering | KingdomFlow",
};

export default async function OfferingsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.offerings.read) {
    return <AccessRestricted label="Offering" />;
  }

  const [offerings, branches] = await Promise.all([getOfferings(organizationId), getBranches(organizationId)]);

  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Offering</h1>
        <p className="mt-1 text-muted-foreground">Amounts collected during services and events.</p>
      </div>

      <OfferingsManager
        organizationId={organizationId}
        offerings={offerings}
        branches={branchOptions}
        canWrite={membership.tabAccess.offerings.write}
        canDelete={membership.tabAccess.offerings.delete}
      />
    </div>
  );
}
