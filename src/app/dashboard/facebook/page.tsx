import type { Metadata } from "next";
import { getLinkedSocialAccounts } from "@/lib/organizations/social-accounts";
import { LinkedAccountCard } from "@/components/social/LinkedAccountCard";
import { requireOrganization } from "@/lib/organizations/dal";
import { getFacebookDashboardData } from "@/lib/facebook/dal";
import { FacebookManagerClient } from "@/components/facebook/FacebookManagerClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { getPlanUsage } from "@/lib/plans/dal";

export const metadata: Metadata = {
  title: "Facebook | KingdomFlow",
};

const STATUS_MESSAGES: Record<string, { message: string; destructive: boolean }> = {
  connected: { message: "Facebook Page connected successfully.", destructive: false },
  denied: { message: "Facebook connection cancelled — the permission request was denied.", destructive: true },
  forbidden: { message: "Only owners and admins can connect Facebook.", destructive: true },
  invalid_state: { message: "That connection attempt expired or was invalid. Please try again.", destructive: true },
  save_failed: { message: "Facebook connected, but saving it failed. Please try again.", destructive: true },
  no_pages: { message: "That Facebook account doesn't manage any Pages.", destructive: true },
  failed: { message: "Couldn't connect Facebook. Please try again.", destructive: true },
  not_configured: { message: "Facebook isn't set up for this app yet — contact your developer.", destructive: true },
};

export default async function FacebookPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.socialMediaEnabled) {
    return <UpgradeRequired label="Facebook" plan={plan.name} />;
  }

  if (!membership.tabAccess.facebook.read) {
    return <AccessRestricted label="Facebook" />;
  }

  const data = await getFacebookDashboardData(organizationId);
  const statusNotice = status && status !== "choose_page" ? STATUS_MESSAGES[status] : undefined;

  // A member who can't manage the connection still sees that the church has one.
  const linkedAccount = !canManage && !data.connected
    ? (await getLinkedSocialAccounts(organizationId)).find((a) => a.platform === "facebook" && a.isActive) ?? null
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Facebook</h1>
        <p className="mt-1 text-muted-foreground">
          Posts, insights, and messages for {membership.organization.name}&apos;s Facebook Page.
        </p>
      </div>

      {statusNotice && (
        <Alert variant={statusNotice.destructive ? "destructive" : "default"}>
          <AlertDescription>{statusNotice.message}</AlertDescription>
        </Alert>
      )}

      {linkedAccount ? (
        <LinkedAccountCard platformLabel="Facebook" accountName={linkedAccount.accountName} pictureUrl={linkedAccount.pictureUrl} />
      ) : (
        <FacebookManagerClient organizationId={organizationId} canManage={canManage} status={status} data={data} />
      )}
    </div>
  );
}
