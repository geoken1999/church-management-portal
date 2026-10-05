import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus, ChevronRight } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanLimits } from "@/lib/plans/dal";
import { getFollowupAutomations } from "@/lib/automations/followup-dal";
import { readFollowupConfig } from "@/lib/automations/followup-config";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInTimezone } from "@/lib/organizations/timezone";
import type { AutomationStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Member Follow-up | KingdomFlow",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function statusBadge(status: AutomationStatus) {
  if (status === "active") return <Badge variant="secondary">Active</Badge>;
  if (status === "paused") return <Badge variant="destructive">Paused</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export default async function FollowupListPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const timezone = membership.organization.timezone;

  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) {
    return <UpgradeRequired label="Automation" plan={plan.name} />;
  }
  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automation" />;
  }

  const canWrite = membership.tabAccess.automations.write;
  const automations = await getFollowupAutomations(organizationId);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/automation" />}>
            <ArrowLeft className="size-4" />
            Automation
          </Button>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Member follow-up</h1>
          <p className="mt-1 text-muted-foreground">
            Create a To Do task for a leader when a member has missed several Sundays in a row. Members are never messaged automatically.
          </p>
        </div>
        {canWrite && (
          <Button nativeButton={false} render={<Link href="/dashboard/automation/followup/new" />}>
            <Plus className="size-4" />
            New follow-up
          </Button>
        )}
      </div>

      {automations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No follow-up automations yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((automation) => {
            const config = readFollowupConfig(automation.config);
            return (
              <Link key={automation.id} href={`/dashboard/automation/followup/${automation.id}`}>
                <Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-primary/20">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{automation.name}</CardTitle>
                      {statusBadge(automation.status)}
                    </div>
                    <CardDescription>
                      {config
                        ? `${config.requiredConsecutive} missed Sundays in a row · runs ${WEEKDAYS[config.runWeekday]}s`
                        : "Settings incomplete"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {automation.last_run_at
                        ? `Last run ${formatInTimezone(automation.last_run_at, timezone, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                        : "Not run yet"}
                    </span>
                    <ChevronRight className="size-4" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
