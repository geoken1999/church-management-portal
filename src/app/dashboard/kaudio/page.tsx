import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeetings, getUpcomingEventOptions } from "@/lib/kmeet/dal";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { KmeetManager } from "@/components/kmeet/KmeetManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "K-Audio | KingdomFlow",
};

export default async function KaudioPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kaudio.read) {
    return <AccessRestricted label="K-Audio" />;
  }

  const [meetings, eventOptions] = await Promise.all([getKmeetMeetings(organizationId, "audio"), getUpcomingEventOptions(organizationId)]);

  const upcoming = meetings.filter((m) => m.status !== "ended");
  const past = meetings.filter((m) => m.status === "ended");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">K-Audio</h1>
        <p className="mt-1 text-muted-foreground">Audio-only calls — start one instantly or schedule one for later.</p>
      </div>

      <KmeetManager
        mode="audio"
        canWrite={membership.tabAccess.kaudio.write}
        available={isVideoSdkConfigured()}
        events={eventOptions}
        upcoming={upcoming}
        past={past}
      />
    </div>
  );
}
