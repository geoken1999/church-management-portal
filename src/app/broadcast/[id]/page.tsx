import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { isLiveStreamEnabled } from "@/lib/livestream/access";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLiveStream } from "@/lib/livestream/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";

export const metadata: Metadata = {
  title: "Broadcast room | KingdomFlow",
};

// The live stream's broadcast room on a page of its own: no dashboard menus,
// the call fills the whole window.
export default async function BroadcastRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) {
    return (
      <div className="p-6">
        <AccessRestricted label="Live stream" />
      </div>
    );
  }

  if (!(await isLiveStreamEnabled(membership.organization.id))) redirect("/dashboard/livestream");
  const stream = await getLiveStream(membership.organization.id, id);
  if (!stream) notFound();

  return (
    <div className="fixed inset-0 overflow-auto bg-background p-2 sm:p-3">
      <KmeetCall
        mode="video"
        meetingId={stream.meeting_id}
        title={stream.title}
        alreadyEnded={stream.status === "ended"}
        canEnd={access.write}
        backHref={`/dashboard/livestream/${stream.id}`}
        liveStreamId={stream.id}
        fullScreen
      />
    </div>
  );
}
