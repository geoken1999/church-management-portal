import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { REMINDER_MINUTES_BEFORE, reminderDue, whenText } from "@/lib/lms/live";
import { enrolledStudentLogins } from "@/lib/lms/live-service";

// Sends the "starts soon" notification for live classes about to begin. Each class is claimed first
// (its reminder time is set only if still empty), so a repeated or overlapping run never sends twice.
export async function sendDueClassReminders(
  now: Date,
): Promise<{ checked: number; reminded: number }> {
  const admin = createAdminClient();
  const horizon = new Date(
    now.getTime() + REMINDER_MINUTES_BEFORE * 60_000,
  ).toISOString();
  const earliest = new Date(now.getTime() - 5 * 60_000).toISOString();
  const { data: sessions } = await admin
    .from("lms_live_sessions")
    .select(
      "id, organization_id, course_id, title, starts_at, status, reminder_sent_at",
    )
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .lte("starts_at", horizon)
    .gt("starts_at", earliest);

  let reminded = 0;
  for (const session of sessions ?? []) {
    if (!reminderDue(now, session)) continue;
    const { data: claimed } = await admin
      .from("lms_live_sessions")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", session.id)
      .is("reminder_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    const logins = await enrolledStudentLogins(session.course_id);
    if (logins.length === 0) continue;
    const { data: org } = await admin
      .from("organizations")
      .select("timezone")
      .eq("id", session.organization_id)
      .maybeSingle();
    const minutes = Math.max(
      1,
      Math.round(
        (new Date(session.starts_at).getTime() - now.getTime()) / 60_000,
      ),
    );
    await sendPushToUsers(logins, "event_update", {
      title:
        minutes > 0
          ? `Class starts in ${minutes} minutes`
          : "Your class is starting",
      body: `${session.title} · ${whenText(session.starts_at, org?.timezone || DEFAULT_TIMEZONE)}`,
      data: {
        type: "lms_class",
        sessionId: session.id,
        courseId: session.course_id,
      },
    });
    reminded += 1;
  }
  return { checked: (sessions ?? []).length, reminded };
}
