import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getYouTubeDashboardData } from "@/lib/youtube/dal";
import { YouTubeManagerClient } from "@/components/youtube/YouTubeManagerClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "YouTube | KingdomFlow",
};

const STATUS_MESSAGES: Record<string, { message: string; destructive: boolean }> = {
  connected: { message: "YouTube connected successfully.", destructive: false },
  denied: { message: "YouTube connection cancelled — the permission request was denied.", destructive: true },
  forbidden: { message: "Only owners and admins can connect YouTube.", destructive: true },
  invalid_state: { message: "That connection attempt expired or was invalid. Please try again.", destructive: true },
  save_failed: { message: "YouTube connected, but saving it failed. Please try again.", destructive: true },
  failed: { message: "Couldn't connect YouTube. Please try again.", destructive: true },
  not_configured: { message: "YouTube isn't set up for this app yet — contact your developer.", destructive: true },
};

export default async function YouTubePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.youtube.read) {
    return <AccessRestricted label="YouTube" />;
  }

  const data = await getYouTubeDashboardData(organizationId);
  const statusNotice = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">YouTube</h1>
        <p className="mt-1 text-muted-foreground">
          Videos, analytics, and comments for {membership.organization.name}&apos;s YouTube channel.
        </p>
      </div>

      {statusNotice && (
        <Alert variant={statusNotice.destructive ? "destructive" : "default"}>
          <AlertDescription>{statusNotice.message}</AlertDescription>
        </Alert>
      )}

      <YouTubeManagerClient organizationId={organizationId} canManage={canManage} data={data} />
    </div>
  );
}
