import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization, getOrganizationMembers } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MembersList } from "@/components/organizations/MembersList";
import { CreateLoginForm } from "@/components/organizations/CreateLoginForm";

export const metadata: Metadata = {
  title: "Team | KingdomFlow",
};

export default async function TeamPage() {
  const user = await requireUser();
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";

  const [members, planUsage] = await Promise.all([
    getOrganizationMembers(membership.organization.id),
    getPlanUsage(membership.organization.id),
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
            {canManage &&
              ` — ${planUsage.additionalTeamMembers}/${planUsage.plan.maxAdditionalTeamMembers} added seats used on the ${planUsage.plan.name} plan`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MembersList
            members={members}
            organizationId={membership.organization.id}
            currentUserId={user.id}
            canManage={canManage}
          />

          {canManage && (
            <>
              <Separator />
              <div className="flex justify-end">
                <CreateLoginForm
                  organizationId={membership.organization.id}
                  seatsRemaining={planUsage.additionalTeamMembersRemaining}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
