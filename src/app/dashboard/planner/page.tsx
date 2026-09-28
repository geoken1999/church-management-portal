import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlans } from "@/lib/planner/dal";
import { getLeaderMembers } from "@/lib/leaders/dal";
import { PlannerManager } from "@/components/planner/PlannerManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Planner | KingdomFlow",
};

export default async function PlannerPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.planner.read) {
    return <AccessRestricted label="Planner" />;
  }

  const [plans, leaders] = await Promise.all([getPlans(organizationId), getLeaderMembers(organizationId)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Planner</h1>
        <p className="mt-1 text-muted-foreground">Jot down initiatives, track a checklist, and see them through to done.</p>
      </div>

      <PlannerManager plans={plans} leaders={leaders} />
    </div>
  );
}
