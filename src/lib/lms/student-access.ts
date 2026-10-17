import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Whether a Bible School student (someone outside the church, with a student account) may join a
// K-Connect call: only when the call is a live class of a course they are enrolled in. The church's
// own calls, meetings and live streams stay closed to them.
export async function studentMayJoin(
  meetingId: string,
  authUserId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from("lms_live_sessions")
    .select("course_id, organization_id")
    .eq("meeting_id", meetingId)
    .eq("status", "scheduled");
  if (!sessions || sessions.length === 0) return false;
  const { data: member } = await admin
    .from("members")
    .select("id, organization_id")
    .eq("auth_user_id", authUserId)
    .eq("status", "student")
    .maybeSingle();
  if (!member) return false;
  const courseIds = sessions
    .filter((s) => s.organization_id === member.organization_id)
    .map((s) => s.course_id);
  if (courseIds.length === 0) return false;
  const { data: enrollment } = await admin
    .from("lms_enrollments")
    .select("id")
    .eq("member_id", member.id)
    .in("course_id", courseIds)
    .in("status", ["approved", "active", "completed"])
    .limit(1)
    .maybeSingle();
  return Boolean(enrollment);
}
