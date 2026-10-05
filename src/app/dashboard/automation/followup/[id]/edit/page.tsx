import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanLimits } from "@/lib/plans/dal";
import { getFollowupAssignees } from "@/lib/automations/followup-assignees";
import { getBranchOptions, getFollowupAutomation } from "@/lib/automations/followup-dal";
import { readFollowupConfig } from "@/lib/automations/followup-config";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { FollowupWizard } from "@/components/automation/FollowupWizard";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Edit Member Follow-up | KingdomFlow",
};

export default async function EditFollowupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) {
    return <UpgradeRequired label="Automation" plan={plan.name} />;
  }
  if (!membership.tabAccess.automations.write) {
    return <AccessRestricted label="Automation" />;
  }

  const automation = await getFollowupAutomation(organizationId, id);
  if (!automation) notFound();
  const config = readFollowupConfig(automation.config);
  if (!config) notFound();

  const [branches, assignees] = await Promise.all([getBranchOptions(organizationId), getFollowupAssignees(organizationId)]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href={`/dashboard/automation/followup/${id}`} />}>
          <ArrowLeft className="size-4" />
          {automation.name}
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Edit member follow-up</h1>
        <p className="mt-1 text-muted-foreground">Changes apply from the next scheduled run.</p>
      </div>

      <FollowupWizard
        automationId={id}
        initial={{
          name: automation.name,
          description: typeof automation.config.description === "string" ? automation.config.description : "",
          requiredConsecutive: config.requiredConsecutive,
          runWeekday: config.runWeekday,
          allBranches: config.branchIds === null,
          branchIds: config.branchIds ?? [],
          assigneeUserId: config.assigneeUserId,
          dueWorkingDays: config.dueWorkingDays,
          priority: config.priority,
        }}
        branches={branches}
        assignees={assignees}
        timezone={membership.organization.timezone}
      />
    </div>
  );
}
