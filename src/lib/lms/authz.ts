import "server-only";

import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageCourse } from "@/lib/lms/rules";

export type Authorized =
  { ok: true; userId: string } | { ok: false; message: string };

// The Bible School tab check (feature flag, plan, role and tab permission), against the church the
// action is for. The organization id comes from the submitted form, so it is always checked against
// the signed-in user here, never trusted.
export async function authorizeTab(
  organizationId: string,
  level: "read" | "write" | "delete",
): Promise<Authorized> {
  await requireUser();
  if (!organizationId) return { ok: false, message: "Choose a church first." };
  return checkTabAccess(organizationId, "bibleschool", level);
}

// Curriculum work: anyone with write access on the tab, or a teaching login assigned to this very
// course (who also needs read access on the tab). The course must belong to the church.
export async function authorizeCurriculum(
  organizationId: string,
  courseId: string,
): Promise<Authorized> {
  const user = await requireUser();
  if (!organizationId || !courseId)
    return { ok: false, message: "That course could not be found." };
  const admin = createAdminClient();
  const { data: course } = await admin
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!course) return { ok: false, message: "That course could not be found." };

  const write = await checkTabAccess(organizationId, "bibleschool", "write");
  if (write.ok) return write;
  const read = await checkTabAccess(organizationId, "bibleschool", "read");
  if (!read.ok) return read;

  const { data: assignment } = await admin
    .from("lms_course_instructors")
    .select("id")
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (
    canManageCourse({
      isAdmin: false,
      canWrite: false,
      isAssignedInstructor: Boolean(assignment),
    })
  )
    return { ok: true, userId: user.id };
  return { ok: false, message: "You can only change courses you teach." };
}
