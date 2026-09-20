import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getInstagramDashboardData } from "@/lib/instagram/dal";
import { InstagramManagerClient } from "@/components/instagram/InstagramManagerClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const organizationId = membership.organization.id;

  const data = await getInstagramDashboardData(organizationId);
  const statusNotice = status ? STATUS_MESSAGES[status] : undefined;

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

      <InstagramManagerClient organizationId={organizationId} canManage={canManage} data={data} />
    </div>
  );
}
