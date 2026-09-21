import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getYouths } from "@/lib/youth/dal";
import { YouthManager } from "@/components/youth/YouthManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Youth | KingdomFlow",
};

export default async function YouthPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.youth.read) {
    return <AccessRestricted label="Youth" />;
  }

  const [members, youths] = await Promise.all([getMembers(organizationId), getYouths(organizationId)]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be added to the youth roster.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({
      id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      phone: member.phone,
      date_of_birth: member.date_of_birth,
    }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Youth</h1>
        <p className="mt-1 text-muted-foreground">The members of {membership.organization.name}&apos;s youth ministry.</p>
      </div>

      <YouthManager organizationId={organizationId} youths={youths} members={assignableMembers} canManage={canManage} />
    </div>
  );
}
