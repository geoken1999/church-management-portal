import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeeting } from "@/lib/kmeet/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";

export const metadata: Metadata = {
  title: "K-Audio | KingdomFlow",
};

export default async function KaudioCallPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kaudio.read) {
    return <AccessRestricted label="K-Audio" />;
  }

  const meeting = await getKmeetMeeting(organizationId, meetingId, "audio");
  if (!meeting) notFound();

  return (
    <KmeetCall
      mode="audio"
      meetingId={meeting.id}
      title={meeting.title}
      alreadyEnded={meeting.status === "ended"}
      canEnd={membership.tabAccess.kaudio.write}
      backHref="/dashboard/kaudio"
    />
  );
}
