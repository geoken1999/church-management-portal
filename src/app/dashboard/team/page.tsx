import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization, getOrganizationMembers, getOrganizationInvitations } from "@/lib/organizations/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MembersList } from "@/components/organizations/MembersList";
import { InvitationsList } from "@/components/organizations/InvitationsList";
import { InviteMemberForm } from "@/components/organizations/InviteMemberForm";

export const metadata: Metadata = {
  title: "Team | KingdomFlow",
};

export default async function TeamPage() {
  const user = await requireUser();
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";

  const [members, invitations] = await Promise.all([
    getOrganizationMembers(membership.organization.id),
    canManage ? getOrganizationInvitations(membership.organization.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Team</h1>
        <p className="mt-1 text-muted-foreground">
          Manage who has access to {membership.organization.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            Members
          </CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "member" : "members"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MembersList members={members} currentUserId={user.id} canManage={canManage} />

          {canManage && (
            <>
              <Separator />
              <InviteMemberForm organizationId={membership.organization.id} />
              <InvitationsList invitations={invitations} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
