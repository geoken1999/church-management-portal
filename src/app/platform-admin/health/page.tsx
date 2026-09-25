import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getIntegrationStatuses, getPlatformOverview, getPlatformEvents } from "@/lib/platform-admin/dal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Health | KingdomFlow Super Admin",
};

export default async function PlatformAdminHealthPage() {
  await requirePlatformAdmin();
  const [integrations, overview, recentErrors] = await Promise.all([
    getIntegrationStatuses(),
    getPlatformOverview(),
    getPlatformEvents({ level: "error", limit: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Health</h1>
        <p className="mt-1 text-muted-foreground">
          Which app-wide integrations are configured, and errors from the last 10 logged.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Integrations</p>
          <p className="text-xs text-muted-foreground">
            This only checks that the required environment variables are set, not that the credentials actually work.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {integrations.map((integration) => (
              <div key={integration.name} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span className="text-sm">{integration.name}</span>
                {integration.configured ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <CheckCircle2 className="size-3.5" />
                    Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <XCircle className="size-3.5" />
                    Not set
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">Total tenants</p>
            <p className="font-heading text-2xl font-bold">{overview.totalTenants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">Total logins across all tenants</p>
            <p className="font-heading text-2xl font-bold">{overview.totalMembers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">Active subscriptions</p>
            <p className="font-heading text-2xl font-bold">{overview.activeSubscriptions}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Recent errors</p>
          {recentErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No errors logged recently.</p>
          ) : (
            <div className="space-y-2">
              {recentErrors.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.source} · {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="destructive">error</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
