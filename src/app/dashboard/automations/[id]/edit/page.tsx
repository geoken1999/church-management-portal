import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAutomation, getAutomationTriggers, getAutomationDestinations, getAutomationTemplates, getEligibleDateFields } from "@/lib/automations/dal";
import { AutomationWizard } from "@/components/automation/AutomationWizard";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Edit Automation | KingdomFlow",
};

export default async function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automations" />;
  }

  const automation = await getAutomation(organizationId, id);
  if (!automation) notFound();
  if (automation.type === "member_followup") redirect(`/dashboard/automation/followup/${automation.id}`);

  const [triggers, destinations, templates, dateFieldOptions] = await Promise.all([
    getAutomationTriggers(organizationId, id),
    getAutomationDestinations(organizationId, id),
    getAutomationTemplates(organizationId),
    getEligibleDateFields(organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{automation.name}</h1>
        <p className="mt-1 text-muted-foreground">Configure triggers, templates, and destinations for this automation.</p>
      </div>

      <AutomationWizard
        organizationId={organizationId}
        automation={automation}
        initialTriggers={triggers}
        initialDestination={destinations}
        dateFieldOptions={dateFieldOptions}
        templates={templates}
        canWrite={membership.tabAccess.automations.write}
      />
    </div>
  );
}
