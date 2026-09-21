import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getWorshipTeamMembers, getWorshipDocuments } from "@/lib/worship/dal";
import { getSiteUrl } from "@/lib/site-url";
import { WorshipManager } from "@/components/worship/WorshipManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Worship | KingdomFlow",
};

export default async function WorshipPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.worship.read) {
    return <AccessRestricted label="Worship" />;
  }

  const siteUrl = getSiteUrl();

  const [members, teamMembers, documents] = await Promise.all([
    getMembers(organizationId),
    getWorshipTeamMembers(organizationId),
    getWorshipDocuments(organizationId),
  ]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be assigned a worship role.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Worship</h1>
        <p className="mt-1 text-muted-foreground">
          The team and shared documents behind {membership.organization.name}&apos;s worship services.
        </p>
      </div>

      <WorshipManager
        organizationId={organizationId}
        siteUrl={siteUrl}
        members={assignableMembers}
        teamMembers={teamMembers}
        documents={documents}
        canManage={canManage}
      />
    </div>
  );
}
