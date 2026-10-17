import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// The enrolled students of a course who use the app, as login ids (for push notifications). Kept out
// of the "use server" action files on purpose: those export public endpoints, and this must not be one.
export async function enrolledStudentLogins(
  courseId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const { data: enrollments } = await admin
    .from("lms_enrollments")
    .select("member_id")
    .eq("course_id", courseId)
    .in("status", ["approved", "active", "completed"]);
  const memberIds = (enrollments ?? []).map((e) => e.member_id);
  if (memberIds.length === 0) return [];
  const { data: members } = await admin
    .from("members")
    .select("auth_user_id")
    .in("id", memberIds)
    .in("status", ["active", "student"])
    .not("auth_user_id", "is", null);
  return (members ?? []).map((m) => m.auth_user_id as string);
}
