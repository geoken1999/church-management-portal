import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { NewAutomationForm } from "@/components/automation/NewAutomationForm";

export const metadata: Metadata = {
  title: "New Automation | KingdomFlow",
};

export default async function NewAutomationPage() {
  const membership = await requireOrganization();

  if (!membership.tabAccess.automations.write) {
    return <AccessRestricted label="Automations" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">New Automation</h1>
      </div>
      <NewAutomationForm />
    </div>
  );
}
