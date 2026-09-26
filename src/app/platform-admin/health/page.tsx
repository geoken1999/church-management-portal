import type { Metadata } from "next";
import { CheckCircle2, XCircle, Database, HardDrive, ExternalLink, AlertTriangle, Rocket, Gauge, AlertOctagon } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getPlatformOverview, getPlatformEvents, getDatabaseHealth, getPlatformStorageStats } from "@/lib/platform-admin/dal";
import { getLatestProductionDeployment } from "@/lib/platform-admin/vercel";
import { getSupabaseProjectStatus } from "@/lib/platform-admin/supabase-management";
import { getPortalResponseTime } from "@/lib/platform-admin/portal-speed";
import { getIntegrationHealth, type IntegrationHealthStatus } from "@/lib/platform-admin/integration-health";
import { formatBytes } from "@/lib/plans/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Health | KingdomFlow Super Admin",
};

const DEPLOYMENT_STATE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  READY: "default",
  ERROR: "destructive",
  CANCELED: "outline",
  BUILDING: "secondary",
  QUEUED: "secondary",
  INITIALIZING: "secondary",
  BLOCKED: "destructive",
};

const INTEGRATION_STATUS_VARIANTS: Record<IntegrationHealthStatus, "default" | "secondary" | "destructive" | "outline"> = {
  operational: "default",
  degraded: "secondary",
  down: "destructive",
  unconfigured: "outline",
};

const INTEGRATION_STATUS_LABELS: Record<IntegrationHealthStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unconfigured: "Not set",
};

export default async function PlatformAdminHealthPage() {
  await requirePlatformAdmin();
  const [integrations, overview, recentErrors, dbHealth, storageStats, deployment, supabaseStatus, portalSpeed] = await Promise.all([
    getIntegrationHealth(),
    getPlatformOverview(),
    getPlatformEvents({ level: "error", limit: 10 }),
    getDatabaseHealth(),
    getPlatformStorageStats(),
    getLatestProductionDeployment(),
    getSupabaseProjectStatus(),
    getPortalResponseTime(),
  ]);

  const speedLabel =
    portalSpeed.responseTimeMs === null ? null : portalSpeed.responseTimeMs < 800 ? "Fast" : portalSpeed.responseTimeMs < 2000 ? "Moderate" : "Slow";
  const speedVariant: "default" | "secondary" | "destructive" = speedLabel === "Fast" ? "default" : speedLabel === "Moderate" ? "secondary" : "destructive";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Health</h1>
        <p className="mt-1 text-muted-foreground">
          Production deployment status, database and storage, live health for every app-wide module and integration,
          and errors from the last 10 logged.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          KingdomFlow runs on Vercel&apos;s serverless platform — there&apos;s no single always-on server to report raw
          CPU usage for, since every request runs in its own short-lived function. For request volume, execution time,
          and compute metrics, check your{" "}
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Vercel Observability dashboard
            <ExternalLink className="size-3" />
          </a>{" "}
          directly.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gauge className="size-4" />
              <p className="text-xs font-medium">Portal response time</p>
            </div>
            {portalSpeed.reachable ? (
              <>
                <p className="flex items-center gap-2 font-heading text-xl font-bold">
                  {portalSpeed.responseTimeMs}ms
                  {speedLabel && <Badge variant={speedVariant}>{speedLabel}</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{portalSpeed.url}</p>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                Unreachable
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Rocket className="size-4" />
              <p className="text-xs font-medium">Production deployment</p>
            </div>
            {!deployment.configured ? (
              <p className="text-sm text-muted-foreground">
                Not connected — add <code>VERCEL_API_TOKEN</code> and <code>VERCEL_PROJECT_ID</code> to enable.
              </p>
            ) : deployment.fetchError ? (
              <p className="text-sm text-destructive">{deployment.fetchError}</p>
            ) : deployment.state ? (
              <>
                <Badge variant={DEPLOYMENT_STATE_VARIANTS[deployment.state] ?? "secondary"}>{deployment.state}</Badge>
                {deployment.readyAt && (
                  <p className="text-xs text-muted-foreground">
                    Went live {new Date(deployment.readyAt).toLocaleString()}
                    {deployment.buildDurationMs !== null && ` · built in ${Math.round(deployment.buildDurationMs / 1000)}s`}
                  </p>
                )}
                {deployment.errorMessage && <p className="text-xs text-destructive">{deployment.errorMessage}</p>}
                {deployment.inspectorUrl && (
                  <a
                    href={deployment.inspectorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View on Vercel
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No production deployments found.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="size-4" />
              <p className="text-xs font-medium">Supabase project</p>
            </div>
            {!supabaseStatus.configured ? (
              <p className="text-sm text-muted-foreground">
                Not connected — add <code>SUPABASE_MANAGEMENT_API_TOKEN</code> to enable.
              </p>
            ) : supabaseStatus.fetchError && !supabaseStatus.disk && !supabaseStatus.services ? (
              <p className="text-sm text-destructive">{supabaseStatus.fetchError}</p>
            ) : (
              <>
                {supabaseStatus.services && (
                  <div className="flex flex-wrap gap-1.5">
                    {supabaseStatus.services.map((service) => (
                      <Badge key={service.name} variant={service.healthy ? "secondary" : "destructive"} className="capitalize">
                        {service.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {supabaseStatus.disk && (
                  <p className="text-xs text-muted-foreground">
                    Disk: {formatBytes(supabaseStatus.disk.usedBytes)} / {formatBytes(supabaseStatus.disk.sizeBytes)} (
                    {supabaseStatus.disk.percentUsed}%)
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="size-4" />
              <p className="text-xs font-medium">Database</p>
            </div>
            {dbHealth.reachable ? (
              <>
                <p className="flex items-center gap-1.5 font-heading text-xl font-bold text-primary">
                  <CheckCircle2 className="size-4" />
                  Healthy
                </p>
                <p className="text-xs text-muted-foreground">{dbHealth.latencyMs}ms response time</p>
              </>
            ) : (
              <p className="flex items-center gap-1.5 font-heading text-xl font-bold text-destructive">
                <AlertTriangle className="size-4" />
                Unreachable
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="size-4" />
              <p className="text-xs font-medium">Database size</p>
            </div>
            <p className="font-heading text-xl font-bold">{storageStats ? formatBytes(storageStats.databaseBytes) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="size-4" />
              <p className="text-xs font-medium">File storage (all tenants)</p>
            </div>
            <p className="font-heading text-xl font-bold">{storageStats ? formatBytes(storageStats.fileStorageBytes) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Module &amp; integration health</p>
          <p className="text-xs text-muted-foreground">
            Most rows are live-checked (an actual authenticated call to the provider, not just an env var check) — YouTube
            has no cheap way to verify its OAuth client without a per-tenant token already in hand, so it only reports
            whether it&apos;s configured.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {integrations.map((integration) => (
              <div key={integration.name} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <span className="text-sm">{integration.name}</span>
                  {integration.detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{integration.detail}</p>}
                </div>
                <Badge variant={INTEGRATION_STATUS_VARIANTS[integration.status]} className="shrink-0">
                  {integration.status === "operational" && <CheckCircle2 className="size-3" />}
                  {integration.status === "down" && <XCircle className="size-3" />}
                  {integration.status === "degraded" && <AlertOctagon className="size-3" />}
                  {INTEGRATION_STATUS_LABELS[integration.status]}
                </Badge>
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
