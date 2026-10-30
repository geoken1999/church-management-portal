import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds } from "@/lib/push/audience";

// Tells the church's members, by push notification, that a Zoom or Google Meet meeting has started so they can tap
// "Join". It goes out once per meeting (the first start claims notified_at), and never to the person who started
// it. Best-effort: a problem here never stops the meeting.
export async function notifyConferenceStarted(meetingId: string, startedByAuthUserId?: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: meeting } = await admin
      .from("conference_meetings")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", meetingId)
      .is("notified_at", null)
      .select("organization_id, provider, title, join_url")
      .maybeSingle();
    if (!meeting) return;

    const recipients = (await resolveAudienceAuthIds(meeting.organization_id, { type: "church" })).filter((id) => id !== startedByAuthUserId);
    if (recipients.length === 0) return;

    const service = meeting.provider === "zoom" ? "Zoom" : "Google Meet";
    await sendPushToUsers(recipients, "church_announcement", {
      title: `${meeting.title} is live`,
      body: `A ${service} meeting has started. Tap to join.`,
      data: { type: "conference_meeting", link: meeting.join_url, buttonLabel: "Join" },
    });
  } catch (err) {
    console.error("notifyConferenceStarted failed:", err);
  }
}
