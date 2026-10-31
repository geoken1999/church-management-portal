import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { resolveAudienceAuthIds, type PushAudience } from "@/lib/push/audience";
import { isGroupKey } from "@/lib/groups/shares";

// Tells the meeting's audience (the whole church, a branch or a group), by push notification, that a Zoom or Google Meet meeting has started so they can tap
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
      .select("organization_id, provider, title, join_url, audience_type, audience_branch_id, audience_group_key")
      .maybeSingle();
    if (!meeting) return;

    const recipients = (await resolveAudienceAuthIds(meeting.organization_id, meetingAudience(meeting))).filter((id) => id !== startedByAuthUserId);
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

function meetingAudience(meeting: { audience_type: string; audience_branch_id: string | null; audience_group_key: string | null }): PushAudience {
  if (meeting.audience_type === "branch" && meeting.audience_branch_id) return { type: "branch", branchId: meeting.audience_branch_id };
  if (meeting.audience_type === "group" && isGroupKey(meeting.audience_group_key)) return { type: "group", groupKey: meeting.audience_group_key };
  return { type: "church" };
}
