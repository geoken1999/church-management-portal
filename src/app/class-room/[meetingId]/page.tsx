import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { KmeetCall } from "@/components/kmeet/KmeetCallLoader";

export const metadata: Metadata = {
  title: "Live class | KingdomFlow",
};

// A Bible School live class on a page of its own, like the live stream's broadcast room: no dashboard
// menus, the call fills the whole window. Only a class of this church's Bible School opens here.
export default async function ClassRoomPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const membership = await requireOrganization();
  const access = membership.tabAccess.bibleschool;
  if (!access.read) {
    return (
      <div className="p-6">
        <AccessRestricted label="Bible School" />
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("lms_live_sessions")
    .select("title, mode, status, meeting_id")
    .eq("organization_id", membership.organization.id)
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!session || session.status === "cancelled") notFound();
  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("status")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) notFound();

  return (
    <div className="fixed inset-0 overflow-auto bg-background p-2 sm:p-3">
      <KmeetCall
        mode={session.mode === "audio" ? "audio" : "video"}
        meetingId={meetingId}
        title={session.title}
        alreadyEnded={meeting.status === "ended"}
        canEnd={access.write}
        backHref="/dashboard/bible-school/live-classes"
        fullScreen
      />
    </div>
  );
}
