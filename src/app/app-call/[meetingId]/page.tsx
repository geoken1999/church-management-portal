import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeeting } from "@/lib/kmeet/dal";
import { tabKeyForMode } from "@/lib/kmeet/mode";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";
import type { KmeetMode } from "@/types/database";

export const metadata: Metadata = {
  title: "K-Connect | KingdomFlow",
};

// A call page with no dashboard around it, opened inside the staff mobile app
// (already signed in through /api/mobile/web-session). Same permissions as the
// dashboard's call page: anyone who can read the tab joins, and anyone who can
// write it moderates. Leaving sends the browser to /app-call/done, which the app
// watches for.
export default async function AppCallPage({ params, searchParams }: { params: Promise<{ meetingId: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { meetingId } = await params;
  const { mode: requested } = await searchParams;
  const mode: KmeetMode = requested === "audio" ? "audio" : "video";
  const membership = await requireOrganization();
  const access = membership.tabAccess[tabKeyForMode(mode)];
  if (!access.read) return <p className="p-6 text-sm">You don&apos;t have access to this call.</p>;

  const meeting = await getKmeetMeeting(membership.organization.id, meetingId, mode);
  if (!meeting) notFound();

  return (
    <div className="min-h-screen bg-background p-2">
      <KmeetCall mode={mode} meetingId={meeting.id} title={meeting.title} alreadyEnded={meeting.status === "ended"} canEnd={access.write} backHref="/app-call/done" />
    </div>
  );
}
