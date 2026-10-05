import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllTenants } from "@/lib/platform-admin/dal";
import { exportTenantsReport } from "@/lib/platform-admin/report-actions";
import { TenantRowActions } from "@/components/platform-admin/TenantRowActions";
import { ReportExportButtons } from "@/components/platform-admin/ReportExportButtons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/lib/plans/config";
import { formatPlatformDate } from "@/lib/platform-admin/format";

export const metadata: Metadata = {
  title: "Tenants | KingdomFlow Super Admin",
};

function statusBadge(tenant: { subscriptionStatus: string | null; trialEndsAt: string | null }) {
  if (tenant.subscriptionStatus === "active") return <Badge>Active</Badge>;
  const stillTrialing = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) > new Date() : false;
  return stillTrialing ? <Badge variant="secondary">Trialing</Badge> : <Badge variant="destructive">Expired</Badge>;
}

export default async function PlatformAdminTenantsPage() {
  await requirePlatformAdmin();
  const tenants = await getAllTenants();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Tenants</h1>
          <p className="mt-1 text-muted-foreground">Every church organization, its plan, and who owns it — {tenants.length} total.</p>
        </div>
        {tenants.length > 0 && <ReportExportButtons onExport={exportTenantsReport} />}
      </div>

      {tenants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No tenants yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <Card key={tenant.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base font-bold">{tenant.name}</h3>
                    {statusBadge(tenant)}
                    <Badge variant={tenant.isCustom ? "default" : "outline"}>{tenant.planName}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {tenant.ownerName ?? "No owner"} {tenant.ownerEmail && `· ${tenant.ownerEmail}`}
                    </span>
                    <span>
                      {tenant.memberCount} {tenant.memberCount === 1 ? "login" : "logins"}
                    </span>
                    <span>Joined {formatPlatformDate(tenant.createdAt)}</span>
                    {tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date() && (
                      <span>Trial ends {formatPlatformDate(tenant.trialEndsAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" variant="outline" size="sm" nativeButton={false} render={<Link href={`/platform-admin/tenants/${tenant.id}`} />}>
                    View details
                    <ChevronRight className="size-3.5" />
                  </Button>
                  <TenantRowActions organizationId={tenant.id} currentPlan={tenant.plan as PlanId} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
