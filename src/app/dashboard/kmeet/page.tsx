import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeetings, getUpcomingEventOptions } from "@/lib/kmeet/dal";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { KmeetManager } from "@/components/kmeet/KmeetManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "K-meet | KingdomFlow",
};

export default async function KmeetPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kmeet.read) {
    return <AccessRestricted label="K-meet" />;
  }

  const [meetings, eventOptions] = await Promise.all([getKmeetMeetings(organizationId, "video"), getUpcomingEventOptions(organizationId)]);

  const upcoming = meetings.filter((m) => m.status !== "ended");
  const past = meetings.filter((m) => m.status === "ended");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">K-meet</h1>
        <p className="mt-1 text-muted-foreground">Video meetings — start one instantly or schedule one for later.</p>
      </div>

      <KmeetManager
        mode="video"
        canWrite={membership.tabAccess.kmeet.write}
        available={isVideoSdkConfigured()}
        events={eventOptions}
        upcoming={upcoming}
        past={past}
        timezone={membership.organization.timezone}
      />
    </div>
  );
}
