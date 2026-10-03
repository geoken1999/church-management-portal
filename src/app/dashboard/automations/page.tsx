import type { Metadata } from "next";
import Link from "next/link";
import { Plus, History, Settings } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAutomations } from "@/lib/automations/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { AutomationStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Automations | KingdomFlow",
};

function statusBadge(status: AutomationStatus) {
  if (status === "active") return <Badge variant="secondary">Active</Badge>;
  if (status === "paused") return <Badge variant="destructive">Paused</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export default async function AutomationsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automations" />;
  }

  const automations = await getAutomations(organizationId);
  const canWrite = membership.tabAccess.automations.write;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Automations</h1>
          <p className="mt-1 text-muted-foreground">
            Automatically send WhatsApp wishes when a member&apos;s birthday or anniversary comes up — no group messaging exists, so messages go directly
            to the member and/or a staff digest.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/automations/templates" />}>
            <Settings className="size-4" />
            Templates
          </Button>
          {canWrite && (
            <Button nativeButton={false} render={<Link href="/dashboard/automations/new" />}>
              <Plus className="size-4" />
              Create Automation
            </Button>
          )}
        </div>
      </div>

      {automations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No automations yet.</p>
            {canWrite && (
              <Button className="mt-4" nativeButton={false} render={<Link href="/dashboard/automations/new" />}>
                <Plus className="size-4" />
                Create your first automation
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((automation) => {
            const triggerCount = automation.automation_triggers?.length ?? 0;
            const activeDestinations = (automation.automation_destinations ?? []).filter((d) => d.is_active).length;

            return (
              <Card key={automation.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{automation.name}</CardTitle>
                    {statusBadge(automation.status)}
                  </div>
                  <CardDescription>
                    {triggerCount} occasion{triggerCount === 1 ? "" : "s"} · {activeDestinations} active destination{activeDestinations === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/automations/${automation.id}/edit`} />}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/dashboard/automations/${automation.id}/history`} />}>
                    <History className="size-4" />
                    History
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
