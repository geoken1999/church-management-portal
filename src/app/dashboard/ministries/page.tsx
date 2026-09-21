import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLeaderMembers } from "@/lib/leaders/dal";
import { getMinistries } from "@/lib/ministries/dal";
import { MinistriesManager } from "@/components/ministries/MinistriesManager";

export const metadata: Metadata = {
  title: "Ministries | KingdomFlow",
};

export default async function MinistriesPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  // Ministry managers are picked from Leaders, not the full members list
  // — see /dashboard/leaders.
  const [leaderMembers, ministries] = await Promise.all([
    getLeaderMembers(organizationId),
    getMinistries(organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Ministries</h1>
        <p className="mt-1 text-muted-foreground">
          The ministries {membership.organization.name} runs — vision, mission, and who leads them.
        </p>
      </div>

      <MinistriesManager
        organizationId={organizationId}
        ministries={ministries}
        members={leaderMembers}
        canManage={canManage}
      />
    </div>
  );
}
