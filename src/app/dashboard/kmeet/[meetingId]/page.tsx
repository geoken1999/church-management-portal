import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeeting } from "@/lib/kmeet/dal";
import { getLiveStreamForMeeting } from "@/lib/livestream/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";

export const metadata: Metadata = {
  title: "K-Connect | KingdomFlow",
};

export default async function KmeetCallPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const meeting = await getKmeetMeeting(organizationId, meetingId, "video");
  if (!meeting) notFound();
  // A live stream's broadcast room is run by whoever may run live streams.
  const stream = await getLiveStreamForMeeting(organizationId, meeting.id);
  if (stream) redirect(`/broadcast/${stream.id}`);
  const access = membership.tabAccess.kmeet;
  if (!access.read) {
    return <AccessRestricted label="K-Connect" />;
  }

  return (
    <KmeetCall
      mode="video"
      meetingId={meeting.id}
      title={meeting.title}
      alreadyEnded={meeting.status === "ended"}
      canEnd={access.write}
      backHref="/dashboard/kconnect?mode=video"
    />
  );
}
