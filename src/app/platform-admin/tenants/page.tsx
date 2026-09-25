import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllTenants } from "@/lib/platform-admin/dal";
import { TenantRowActions } from "@/components/platform-admin/TenantRowActions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlanId } from "@/lib/plans/config";

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
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Tenants</h1>
        <p className="mt-1 text-muted-foreground">Every church organization, its plan, and who owns it — {tenants.length} total.</p>
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
                    <Badge variant="outline">{tenant.planName}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {tenant.ownerName ?? "No owner"} {tenant.ownerEmail && `· ${tenant.ownerEmail}`}
                    </span>
                    <span>
                      {tenant.memberCount} {tenant.memberCount === 1 ? "login" : "logins"}
                    </span>
                    <span>Joined {new Date(tenant.createdAt).toLocaleDateString()}</span>
                    {tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date() && (
                      <span>Trial ends {new Date(tenant.trialEndsAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <TenantRowActions organizationId={tenant.id} currentPlan={tenant.plan as PlanId} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
