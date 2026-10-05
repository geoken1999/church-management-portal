import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanLimits } from "@/lib/plans/dal";
import { getFollowupAssignees } from "@/lib/automations/followup-assignees";
import { getBranchOptions } from "@/lib/automations/followup-dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { FollowupWizard } from "@/components/automation/FollowupWizard";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "New Member Follow-up | KingdomFlow",
};

export default async function NewFollowupPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) {
    return <UpgradeRequired label="Automation" plan={plan.name} />;
  }
  if (!membership.tabAccess.automations.write) {
    return <AccessRestricted label="Automation" />;
  }

  const [branches, assignees] = await Promise.all([getBranchOptions(organizationId), getFollowupAssignees(organizationId)]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/automation/followup" />}>
          <ArrowLeft className="size-4" />
          Member follow-up
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">New member follow-up</h1>
        <p className="mt-1 text-muted-foreground">
          Create a To Do task for a leader when a member has missed several Sundays in a row. Nothing is sent to the member.
        </p>
      </div>

      <FollowupWizard
        branches={branches}
        assignees={assignees}
        timezone={membership.organization.timezone}
      />
    </div>
  );
}
