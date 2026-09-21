import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getLeaders } from "@/lib/leaders/dal";
import { LeadersManager } from "@/components/leaders/LeadersManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Leaders | KingdomFlow",
};

export default async function LeadersPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.leaders.read) {
    return <AccessRestricted label="Leaders" />;
  }

  const [members, leaders] = await Promise.all([getMembers(organizationId), getLeaders(organizationId)]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be designated a leader.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name, phone: member.phone }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Leaders</h1>
        <p className="mt-1 text-muted-foreground">
          Members designated as leaders — selectable as a manager for ministries, branches, and events.
        </p>
      </div>

      <LeadersManager organizationId={organizationId} leaders={leaders} members={assignableMembers} canManage={canManage} />
    </div>
  );
}
