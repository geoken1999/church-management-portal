import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAutomationTemplates } from "@/lib/automations/dal";
import { AutomationTemplateManager } from "@/components/automation/AutomationTemplateManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Automation Templates | KingdomFlow",
};

export default async function AutomationTemplatesPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automations" />;
  }

  const templates = await getAutomationTemplates(organizationId);
  const canWrite = membership.tabAccess.automations.write;

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/automations" />}>
          <ArrowLeft className="size-4" />
          Automations
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Automation Templates</h1>
        <p className="mt-1 text-muted-foreground">Pre-approved WhatsApp message templates used by your automations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member messages</CardTitle>
          <CardDescription>Sent directly to the member being celebrated.</CardDescription>
        </CardHeader>
        <CardContent>
          <AutomationTemplateManager organizationId={organizationId} templates={templates} kind="member_direct" canManage={canWrite} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff digest</CardTitle>
          <CardDescription>One combined message listing everyone celebrating that day, sent to your staff numbers.</CardDescription>
        </CardHeader>
        <CardContent>
          <AutomationTemplateManager organizationId={organizationId} templates={templates} kind="staff_digest" canManage={canWrite} />
        </CardContent>
      </Card>
    </div>
  );
}
