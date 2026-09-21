import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getMinistries } from "@/lib/ministries/dal";
import { MinistriesManager } from "@/components/ministries/MinistriesManager";

export const metadata: Metadata = {
  title: "Ministries | KingdomFlow",
};

export default async function MinistriesPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  const [members, ministries] = await Promise.all([getMembers(organizationId), getMinistries(organizationId)]);

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be assigned to manage a ministry.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name }));

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
        members={assignableMembers}
        canManage={canManage}
      />
    </div>
  );
}
