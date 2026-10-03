import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAutomation, getAutomationExecutions } from "@/lib/automations/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AutomationExecutionStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Automation History | KingdomFlow",
};

function statusBadge(status: AutomationExecutionStatus) {
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Skipped</Badge>;
}

export default async function AutomationHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.automations.read) {
    return <AccessRestricted label="Automations" />;
  }

  const automation = await getAutomation(organizationId, id);
  if (!automation) notFound();

  const executions = await getAutomationExecutions(organizationId, id);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href={`/dashboard/automations/${id}/edit`} />}>
          <ArrowLeft className="size-4" />
          {automation.name}
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Execution History</h1>
        <p className="mt-1 text-muted-foreground">Every message this automation has sent, skipped, or failed to send.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {executions.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No executions yet.</p>
            ) : (
              executions.map((execution) => (
                <div key={execution.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {execution.destination_kind === "staff_digest"
                          ? "Staff digest"
                          : execution.members
                            ? `${execution.members.first_name} ${execution.members.last_name}`
                            : "Member"}
                      </span>
                      {statusBadge(execution.status)}
                    </div>
                    {execution.error_message && <p className="mt-1 text-xs text-destructive">{execution.error_message}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(execution.sent_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
