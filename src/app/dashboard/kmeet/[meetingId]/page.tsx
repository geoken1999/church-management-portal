import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeeting } from "@/lib/kmeet/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";

export const metadata: Metadata = {
  title: "K-meet | KingdomFlow",
};

export default async function KmeetCallPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kmeet.read) {
    return <AccessRestricted label="K-meet" />;
  }

  const meeting = await getKmeetMeeting(organizationId, meetingId);
  if (!meeting) notFound();

  return (
    <KmeetCall
      meetingId={meeting.id}
      title={meeting.title}
      alreadyEnded={meeting.status === "ended"}
      canEnd={membership.tabAccess.kmeet.write}
      backHref="/dashboard/kmeet"
    />
  );
}
