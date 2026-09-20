import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers, getMemberFieldDefinitions } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getSiteUrl } from "@/lib/site-url";
import { MembersManager } from "@/components/members/MembersManager";

export const metadata: Metadata = {
  title: "Members | KingdomFlow",
};

export default async function MembersPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";

  const [members, definitions, branches] = await Promise.all([
    getMembers(membership.organization.id),
    getMemberFieldDefinitions(membership.organization.id),
    getBranches(membership.organization.id),
  ]);

  // Resolved server-side (not via window.location) so the rendered link is
  // identical during SSR and client hydration — avoids a hydration mismatch.
  const siteUrl = getSiteUrl();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Members</h1>
        <p className="mt-1 text-muted-foreground">
          The congregation roster for {membership.organization.name}.
        </p>
      </div>

      <MembersManager
        organizationId={membership.organization.id}
        orgSlug={membership.organization.slug}
        orgName={membership.organization.name}
        siteUrl={siteUrl}
        members={members}
        definitions={definitions}
        branches={branches}
        canManage={canManage}
      />
    </div>
  );
}
