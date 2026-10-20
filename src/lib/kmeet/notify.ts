import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds } from "@/lib/push/audience";

// Tells the church's members, by push notification, that a K-Connect call has just gone live so they can tap
// and join. Called once, at the moment a call starts (an instant meeting being created, or a scheduled one
// being opened for the first time). A live stream's room and a Bible School class have their own announcements
// and are left out. Best-effort: a problem here never stops the call.
export async function notifyCallStarted(
  meetingId: string,
  startedByAuthUserId?: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: meeting } = await admin
      .from("kmeet_meetings")
      .select("id, organization_id, title, mode, status")
      .eq("id", meetingId)
      .maybeSingle();
    if (!meeting || meeting.status !== "live") return;

    const [{ count: streams }, { count: classes }] = await Promise.all([
      admin
        .from("live_streams")
        .select("id", { count: "exact", head: true })
        .eq("meeting_id", meetingId),
      admin
        .from("lms_live_sessions")
        .select("id", { count: "exact", head: true })
        .eq("meeting_id", meetingId),
    ]);
    if ((streams ?? 0) > 0 || (classes ?? 0) > 0) return;

    const recipients = (
      await resolveAudienceAuthIds(meeting.organization_id, { type: "church" })
    ).filter((id) => id !== startedByAuthUserId);
    if (recipients.length === 0) return;

    const audio = meeting.mode === "audio";
    await sendPushToUsers(recipients, "church_announcement", {
      title: `${meeting.title} is live`,
      body: audio
        ? "An audio call has started. Tap to join."
        : "A video call has started. Tap to join.",
      data: {
        type: "kmeet_call",
        meetingId: meeting.id,
        mode: meeting.mode,
        title: meeting.title,
      },
    });
  } catch (err) {
    console.error("notifyCallStarted failed:", err);
  }
}
