import type { Metadata } from "next";
import { Suspense } from "react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getInstagramDashboardData, getInstagramConnections } from "@/lib/instagram/dal";
import { InstagramManagerClient } from "@/components/instagram/InstagramManagerClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { getPlanUsage } from "@/lib/plans/dal";

export const metadata: Metadata = {
  title: "Instagram | KingdomFlow",
};

const STATUS_MESSAGES: Record<string, { message: string; destructive: boolean }> = {
  connected: { message: "Instagram connected successfully.", destructive: false },
  denied: { message: "Instagram connection cancelled — the permission request was denied.", destructive: true },
  forbidden: { message: "Only owners and admins can connect Instagram.", destructive: true },
  invalid_state: { message: "That connection attempt expired or was invalid. Please try again.", destructive: true },
  save_failed: { message: "Instagram connected, but saving it failed. Please try again.", destructive: true },
  failed: { message: "Couldn't connect Instagram. Please try again.", destructive: true },
  not_configured: { message: "Instagram isn't set up for this app yet — contact your developer.", destructive: true },
};

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const canWrite = membership.tabAccess.instagram.write;
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.socialMediaEnabled) {
    return <UpgradeRequired label="Instagram" plan={plan.name} />;
  }

  if (!membership.tabAccess.instagram.read) {
    return <AccessRestricted label="Instagram" />;
  }

  const statusNotice =
    status === "account_limit_reached"
      ? {
          message: `Your ${plan.name} plan allows up to ${plan.instagramAccountLimit} connected Instagram ${plan.instagramAccountLimit === 1 ? "account" : "accounts"}. Disconnect one or upgrade your plan to add another.`,
          destructive: true,
        }
      : status
        ? STATUS_MESSAGES[status]
        : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Instagram</h1>
        <p className="mt-1 text-muted-foreground">
          Posts, insights, and messages for {membership.organization.name}&apos;s Instagram profile.
        </p>
      </div>

      {statusNotice && (
        <Alert variant={statusNotice.destructive ? "destructive" : "default"}>
          <AlertDescription>{statusNotice.message}</AlertDescription>
        </Alert>
      )}

      {/* The heading above shows at once; the Instagram data (several calls to Instagram) streams in below. */}
      <Suspense fallback={<InstagramSkeleton />}>
        <InstagramData organizationId={organizationId} canManage={canManage} canWrite={canWrite} />
      </Suspense>
    </div>
  );
}

async function InstagramData({ organizationId, canManage, canWrite }: { organizationId: string; canManage: boolean; canWrite: boolean }) {
  const [data, accounts] = await Promise.all([
    getInstagramDashboardData(organizationId),
    getInstagramConnections(organizationId),
  ]);
  return <InstagramManagerClient organizationId={organizationId} canManage={canManage} canWrite={canWrite} data={data} accounts={accounts} />;
}

function InstagramSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Instagram">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
