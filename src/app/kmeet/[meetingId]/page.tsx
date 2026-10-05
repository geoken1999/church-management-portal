import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicKmeetMeeting } from "@/lib/kmeet/dal";
import { KmeetGuestJoin } from "@/components/kmeet/KmeetGuestJoin";

export async function generateMetadata({ params }: { params: Promise<{ meetingId: string }> }): Promise<Metadata> {
  const { meetingId } = await params;
  const meeting = await getPublicKmeetMeeting(meetingId, "video");
  return { title: meeting ? `${meeting.title} | K-Meet` : "Meeting not found | K-Meet" };
}

// Public — anyone with the link can join, no KingdomFlow account needed
// (the whole point of an "invite link"). Only exposes what
// getPublicKmeetMeeting selects (title/status), same minimal-exposure
// shape as this app's other invite-link pages.
export default async function PublicKmeetPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const meeting = await getPublicKmeetMeeting(meetingId, "video");
  if (!meeting) notFound();

  return <KmeetGuestJoin mode="video" meetingId={meeting.id} title={meeting.title} alreadyEnded={meeting.status === "ended"} />;
}
