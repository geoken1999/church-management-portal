"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStorageQuota } from "@/lib/plans/dal";
import { authorizeCurriculum, authorizeTab } from "@/lib/lms/authz";
import { logLmsEvent } from "@/lib/lms/audit";
import { sanitizeLessonHtml } from "@/lib/lms/sanitize";
import { LMS_BASE_PATH, type EnrollmentAction } from "@/lib/lms/constants";
import {
  LESSON_FILE_RULES,
  lessonDeletable,
  lessonFileProblem,
} from "@/lib/lms/rules";
import {
  hasErrors,
  validateCourse,
  validateLesson,
  validateModule,
  validateProgram,
  validateSettings,
  type CourseInput,
  type LessonInput,
  type ModuleInput,
  type ProgramInput,
  type SettingsInput,
} from "@/lib/lms/validation";
import type { LmsPublishState } from "@/types/database";

export interface LmsResult {
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
  success?: boolean;
  id?: string;
}

const fail = (message: string): LmsResult => ({ error: message });
const STATES: LmsPublishState[] = ["draft", "published", "archived"];
const COVER_BUCKET = "lms-course-covers";
const COVER_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function refresh(...paths: string[]) {
  revalidatePath(LMS_BASE_PATH);
  for (const path of paths) revalidatePath(`${LMS_BASE_PATH}${path}`);
}

// Rejects an id that does not belong to the church (a forged id from another church is just "not found").
async function owned(
  table:
    | "lms_programs"
    | "lms_courses"
    | "lms_modules"
    | "lms_lessons"
    | "lms_enrollments"
    | "lms_program_enrollments",
  organizationId: string,
  id: string,
) {
  const { data } = await createAdminClient()
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export async function saveSettingsAction(
  organizationId: string,
  input: SettingsInput & {
    requireApproval: boolean;
    allowSelfEnrollment: boolean;
  },
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const fieldErrors = validateSettings(input);
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const { error } = await createAdminClient()
    .from("lms_settings")
    .upsert(
      {
        organization_id: organizationId,
        school_name: input.schoolName.trim(),
        tagline: input.tagline.trim() || null,
        default_language: input.defaultLanguage.trim(),
        enrollment_requires_approval: input.requireApproval,
        allow_self_enrollment: input.allowSelfEnrollment,
      },
      { onConflict: "organization_id" },
    );
  if (error) return fail("Couldn't save the settings. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "settings.updated",
    entityType: "settings",
    entityId: organizationId,
  });
  refresh("/settings");
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------------------------

export async function saveProgramAction(
  organizationId: string,
  programId: string | null,
  input: ProgramInput,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const fieldErrors = validateProgram(input);
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const admin = createAdminClient();
  const row = {
    title: input.title.trim(),
    description: input.description.trim() || null,
    objectives: input.objectives.trim() || null,
    price_amount: input.price.trim() ? Number(input.price) : null,
    capacity: input.capacity.trim() ? Number(input.capacity) : null,
    visibility: input.visibility as "organization" | "public",
  };
  if (programId) {
    if (!(await owned("lms_programs", organizationId, programId)))
      return fail("That program could not be found.");
    const { error } = await admin
      .from("lms_programs")
      .update(row)
      .eq("id", programId)
      .eq("organization_id", organizationId);
    if (error) return fail("Couldn't save the program. Please try again.");
    refresh("/programs");
    return { success: true, id: programId };
  }
  const { data, error } = await admin
    .from("lms_programs")
    .insert({
      ...row,
      organization_id: organizationId,
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (error || !data)
    return fail("Couldn't create the program. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "program.created",
    entityType: "program",
    entityId: data.id,
  });
  refresh("/programs");
  return { success: true, id: data.id };
}

export async function setProgramStatusAction(
  organizationId: string,
  programId: string,
  status: LmsPublishState,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!STATES.includes(status)) return fail("Choose a valid status.");
  if (!(await owned("lms_programs", organizationId, programId)))
    return fail("That program could not be found.");
  const { error } = await createAdminClient()
    .from("lms_programs")
    .update({ status })
    .eq("id", programId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't update the program. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: `program.${status}`,
    entityType: "program",
    entityId: programId,
  });
  refresh("/programs");
  return { success: true };
}

export async function deleteProgramAction(
  organizationId: string,
  programId: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "delete");
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: program } = await admin
    .from("lms_programs")
    .select("status")
    .eq("id", programId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!program) return fail("That program could not be found.");
  if (program.status === "published")
    return fail("Archive a published program instead of deleting it.");
  const { error } = await admin
    .from("lms_programs")
    .delete()
    .eq("id", programId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't delete the program. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "program.deleted",
    entityType: "program",
    entityId: programId,
  });
  refresh("/programs");
  return { success: true };
}

// Replaces a program's courses with the given ones, in the given order.
export async function setProgramCoursesAction(
  organizationId: string,
  programId: string,
  courseIds: string[],
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!(await owned("lms_programs", organizationId, programId)))
    return fail("That program could not be found.");
  const admin = createAdminClient();
  const unique = [...new Set(courseIds)];
  if (unique.length > 0) {
    const { data: valid } = await admin
      .from("lms_courses")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", unique);
    if ((valid ?? []).length !== unique.length)
      return fail("One of those courses could not be found.");
  }
  const { error: clearError } = await admin
    .from("lms_program_courses")
    .delete()
    .eq("program_id", programId)
    .eq("organization_id", organizationId);
  if (clearError)
    return fail("Couldn't update the program's courses. Please try again.");
  if (unique.length > 0) {
    const { error } = await admin.from("lms_program_courses").insert(
      unique.map((courseId, position) => ({
        program_id: programId,
        course_id: courseId,
        organization_id: organizationId,
        position,
      })),
    );
    if (error)
      return fail("Couldn't update the program's courses. Please try again.");
  }
  // People already in the program get the courses that were added to it.
  const { data: open } = await admin
    .from("lms_program_enrollments")
    .select("id")
    .eq("program_id", programId)
    .in("status", ["approved", "active"]);
  for (const enrollment of open ?? []) {
    await admin.rpc("lms_program_sync_courses", {
      p_program_enrollment: enrollment.id,
    });
  }
  refresh("/programs");
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Program enrollments: students join the program, and so every course in it
// ---------------------------------------------------------------------------------------------

function programEnrollmentMessage(message: string | undefined): string {
  const known = [
    "could not be found",
    "is not open for enrollment",
    "already has an open enrollment",
    "This program is full.",
  ];
  const hit = known.find((k) => message?.includes(k));
  if (hit) return message ?? hit;
  if (message?.includes("is not possible for an enrollment"))
    return "That change isn't possible for this enrollment.";
  return "Couldn't update the enrollment. Please try again.";
}

export async function enrollInProgramAction(
  organizationId: string,
  programId: string,
  memberId: string,
  status: "pending" | "approved",
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (status !== "pending" && status !== "approved")
    return fail("Choose pending or approved.");
  const { data, error } = await createAdminClient().rpc("lms_enroll_program", {
    p_organization_id: organizationId,
    p_program_id: programId,
    p_member_id: memberId,
    p_status: status,
    p_source: "admin",
    p_actor: access.userId,
  });
  if (error) return fail(programEnrollmentMessage(error.message));
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "program_enrollment.created",
    entityType: "program_enrollment",
    entityId: data as string,
    metadata: { programId, memberId, status },
  });
  refresh(`/programs/${programId}`, "/enrollments");
  return { success: true, id: data as string };
}

export async function decideProgramEnrollmentAction(
  organizationId: string,
  enrollmentId: string,
  action: "approve" | "reject" | "withdraw",
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!["approve", "reject", "withdraw"].includes(action))
    return fail("Choose a valid action.");
  if (!(await owned("lms_program_enrollments", organizationId, enrollmentId)))
    return fail("That enrollment could not be found.");
  const { data, error } = await createAdminClient().rpc(
    "lms_decide_program_enrollment",
    {
      p_organization_id: organizationId,
      p_enrollment_id: enrollmentId,
      p_action: action,
      p_actor: access.userId,
    },
  );
  if (error) return fail(programEnrollmentMessage(error.message));
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: `program_enrollment.${action}`,
    entityType: "program_enrollment",
    entityId: enrollmentId,
    metadata: { status: data },
  });
  refresh("/programs", "/enrollments");
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

function courseRow(input: CourseInput) {
  return {
    title: input.title.trim(),
    code: input.code.trim() || null,
    description: input.description.trim() || null,
    objectives: input.objectives.trim() || null,
    level: input.level as "beginner" | "intermediate" | "advanced",
    language: input.language.trim(),
    delivery_mode: input.deliveryMode as
      "self_paced" | "instructor_led" | "blended",
    visibility: input.visibility as "organization" | "unlisted" | "public",
    enrollment_opens_at: input.enrollmentOpensAt
      ? new Date(input.enrollmentOpensAt).toISOString()
      : null,
    enrollment_closes_at: input.enrollmentClosesAt
      ? new Date(input.enrollmentClosesAt).toISOString()
      : null,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    estimated_hours: input.estimatedHours.trim()
      ? Number(input.estimatedHours)
      : null,
    capacity: input.capacity.trim() ? Number(input.capacity) : null,
  };
}

function codeConflict(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createCourseAction(
  organizationId: string,
  input: CourseInput,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const fieldErrors = validateCourse(input);
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const { data, error } = await createAdminClient()
    .from("lms_courses")
    .insert({
      ...courseRow(input),
      organization_id: organizationId,
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (codeConflict(error))
    return { fieldErrors: { code: "Another course already uses that code." } };
  if (error || !data)
    return fail("Couldn't create the course. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "course.created",
    entityType: "course",
    entityId: data.id,
  });
  refresh("/courses");
  return { success: true, id: data.id };
}

export async function updateCourseAction(
  organizationId: string,
  courseId: string,
  input: CourseInput,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!(await owned("lms_courses", organizationId, courseId)))
    return fail("That course could not be found.");
  const fieldErrors = validateCourse(input);
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const { error } = await createAdminClient()
    .from("lms_courses")
    .update(courseRow(input))
    .eq("id", courseId)
    .eq("organization_id", organizationId);
  if (codeConflict(error))
    return { fieldErrors: { code: "Another course already uses that code." } };
  if (error) return fail("Couldn't save the course. Please try again.");
  refresh("/courses", `/courses/${courseId}`);
  return { success: true, id: courseId };
}

// Publishing needs something to learn: at least one published lesson in a published module.
export async function setCourseStatusAction(
  organizationId: string,
  courseId: string,
  status: LmsPublishState,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!STATES.includes(status)) return fail("Choose a valid status.");
  if (!(await owned("lms_courses", organizationId, courseId)))
    return fail("That course could not be found.");
  const admin = createAdminClient();
  if (status === "published") {
    const { data: modules } = await admin
      .from("lms_modules")
      .select("id")
      .eq("course_id", courseId)
      .eq("status", "published");
    const moduleIds = (modules ?? []).map((m) => m.id);
    const { count } = moduleIds.length
      ? await admin
          .from("lms_lessons")
          .select("id", { count: "exact", head: true })
          .eq("course_id", courseId)
          .eq("status", "published")
          .in("module_id", moduleIds)
      : { count: 0 };
    if (!count)
      return fail(
        "Publish at least one lesson in a published module before publishing the course.",
      );
  }
  const { error } = await admin
    .from("lms_courses")
    .update({ status })
    .eq("id", courseId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't update the course. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: `course.${status}`,
    entityType: "course",
    entityId: courseId,
  });
  refresh("/courses", `/courses/${courseId}`);
  return { success: true };
}

// A course can be deleted only while it is a draft with nobody enrolled; anything else is archived.
export async function deleteCourseAction(
  organizationId: string,
  courseId: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "delete");
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: course } = await admin
    .from("lms_courses")
    .select("status")
    .eq("id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!course) return fail("That course could not be found.");
  if (course.status !== "draft")
    return fail(
      "Only a draft course can be deleted. Archive this one instead.",
    );
  const { count } = await admin
    .from("lms_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);
  if (count) return fail("This course has enrollments. Archive it instead.");
  const { error } = await admin
    .from("lms_courses")
    .delete()
    .eq("id", courseId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't delete the course. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "course.deleted",
    entityType: "course",
    entityId: courseId,
  });
  refresh("/courses");
  return { success: true };
}

export async function uploadCourseCoverAction(
  formData: FormData,
): Promise<LmsResult & { url?: string }> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!(await owned("lms_courses", organizationId, courseId)))
    return fail("That course could not be found.");
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0)
    return fail("Choose an image to upload.");
  const ext = COVER_TYPES[file.type];
  if (!ext) return fail("Use a JPEG, PNG or WebP image.");
  if (file.size > 2 * 1024 * 1024)
    return fail("That image is over 2 MB. Try a smaller one.");
  const quota = await checkStorageQuota(organizationId, file.size);
  if (quota) return fail(quota);
  const admin = createAdminClient();
  const path = `${organizationId}/${courseId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from(COVER_BUCKET)
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
    });
  if (error) return fail("Couldn't upload that image. Try again.");
  const url = admin.storage.from(COVER_BUCKET).getPublicUrl(path)
    .data.publicUrl;
  const { error: saveError } = await admin
    .from("lms_courses")
    .update({ cover_image_url: url })
    .eq("id", courseId)
    .eq("organization_id", organizationId);
  if (saveError) return fail("Couldn't save the cover image. Try again.");
  refresh(`/courses/${courseId}`);
  return { success: true, url };
}

// A course's prerequisites: other courses of the same church, never itself, never a course that
// already requires this one.
export async function setPrerequisitesAction(
  organizationId: string,
  courseId: string,
  prerequisiteIds: string[],
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!(await owned("lms_courses", organizationId, courseId)))
    return fail("That course could not be found.");
  const admin = createAdminClient();
  const unique = [...new Set(prerequisiteIds)];
  if (unique.includes(courseId))
    return fail("A course can't be its own prerequisite.");
  if (unique.length > 0) {
    const { data: valid } = await admin
      .from("lms_courses")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", unique);
    if ((valid ?? []).length !== unique.length)
      return fail("One of those courses could not be found.");
    const { data: loops } = await admin
      .from("lms_course_prerequisites")
      .select("course_id")
      .eq("organization_id", organizationId)
      .eq("prerequisite_course_id", courseId)
      .in("course_id", unique);
    if ((loops ?? []).length > 0)
      return fail("Two courses can't require each other.");
  }
  await admin
    .from("lms_course_prerequisites")
    .delete()
    .eq("course_id", courseId)
    .eq("organization_id", organizationId);
  if (unique.length > 0) {
    const { error } = await admin.from("lms_course_prerequisites").insert(
      unique.map((id) => ({
        course_id: courseId,
        prerequisite_course_id: id,
        organization_id: organizationId,
      })),
    );
    if (error)
      return fail("Couldn't save the prerequisites. Please try again.");
  }
  refresh(`/courses/${courseId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Instructors
// ---------------------------------------------------------------------------------------------

export async function addInstructorAction(
  organizationId: string,
  courseId: string,
  memberId: string,
  authUserId: string,
  role: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!(await owned("lms_courses", organizationId, courseId)))
    return fail("That course could not be found.");
  if (role !== "lead" && role !== "assistant")
    return fail("Choose lead or assistant.");
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return fail("That member could not be found.");
  if (authUserId) {
    const { data: login } = await admin
      .from("organization_members")
      .select("auth_user_id")
      .eq("organization_id", organizationId)
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (!login) return fail("That team login could not be found.");
  }
  const { error } = await admin.from("lms_course_instructors").insert({
    course_id: courseId,
    organization_id: organizationId,
    member_id: memberId,
    auth_user_id: authUserId || null,
    role,
  });
  if (error?.code === "23505")
    return fail("That person already teaches this course.");
  if (error) return fail("Couldn't add the instructor. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "instructor.assigned",
    entityType: "course",
    entityId: courseId,
    metadata: { memberId },
  });
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function removeInstructorAction(
  organizationId: string,
  instructorId: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("lms_course_instructors")
    .select("course_id, member_id")
    .eq("id", instructorId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return fail("That instructor could not be found.");
  const { error } = await admin
    .from("lms_course_instructors")
    .delete()
    .eq("id", instructorId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't remove the instructor. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "instructor.removed",
    entityType: "course",
    entityId: row.course_id,
    metadata: { memberId: row.member_id },
  });
  refresh(`/courses/${row.course_id}`);
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Curriculum (modules and lessons)
// ---------------------------------------------------------------------------------------------

export async function saveModuleAction(
  organizationId: string,
  courseId: string,
  moduleId: string | null,
  input: ModuleInput,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const fieldErrors = validateModule(input);
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const admin = createAdminClient();
  const row = {
    title: input.title.trim(),
    description: input.description.trim() || null,
  };
  if (moduleId) {
    const { error } = await admin
      .from("lms_modules")
      .update(row)
      .eq("id", moduleId)
      .eq("course_id", courseId)
      .eq("organization_id", organizationId);
    if (error) return fail("Couldn't save the module. Please try again.");
  } else {
    const { count } = await admin
      .from("lms_modules")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);
    const { error } = await admin.from("lms_modules").insert({
      ...row,
      course_id: courseId,
      organization_id: organizationId,
      position: count ?? 0,
    });
    if (error) return fail("Couldn't add the module. Please try again.");
  }
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function setModuleStatusAction(
  organizationId: string,
  courseId: string,
  moduleId: string,
  status: LmsPublishState,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  if (!STATES.includes(status)) return fail("Choose a valid status.");
  const { error } = await createAdminClient()
    .from("lms_modules")
    .update({ status })
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't update the module. Please try again.");
  refresh(`/courses/${courseId}`);
  return { success: true };
}

// Only a draft module with no published lessons can be deleted; anything else is archived.
export async function deleteModuleAction(
  organizationId: string,
  courseId: string,
  moduleId: string,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: module_ } = await admin
    .from("lms_modules")
    .select("status")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!module_) return fail("That module could not be found.");
  if (module_.status !== "draft")
    return fail("Archive a published module instead of deleting it.");
  const { count } = await admin
    .from("lms_lessons")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId)
    .neq("status", "draft");
  if (count)
    return fail("This module has published lessons. Archive it instead.");
  const { error } = await admin
    .from("lms_modules")
    .delete()
    .eq("id", moduleId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't delete the module. Please try again.");
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function moveModuleAction(
  organizationId: string,
  courseId: string,
  moduleId: string,
  direction: -1 | 1,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const { error } = await createAdminClient().rpc("lms_move_module", {
    p_organization_id: organizationId,
    p_module_id: moduleId,
    p_direction: direction,
  });
  if (error) return fail("Couldn't move the module. Please try again.");
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function saveLessonAction(
  organizationId: string,
  courseId: string,
  moduleId: string,
  lessonId: string | null,
  input: LessonInput & { isRequired: boolean; isFreePreview: boolean },
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  // A lesson that already has an uploaded file doesn't need a link.
  const existing = lessonId
    ? (
        await admin
          .from("lms_lessons")
          .select("file_path, media_url")
          .eq("id", lessonId)
          .eq("course_id", courseId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      ).data
    : null;
  const fieldErrors = validateLesson({
    ...input,
    hasFile: Boolean(existing?.file_path) || input.hasFile === true,
  });
  if (hasErrors(fieldErrors)) return { fieldErrors };
  const { data: module_ } = await admin
    .from("lms_modules")
    .select("id")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!module_) return fail("That module could not be found.");

  const type = input.contentType as
    "text" | "video" | "audio" | "document" | "resource" | "external";
  const row = {
    title: input.title.trim(),
    content_type: type,
    body: type === "text" ? sanitizeLessonHtml(input.body) : null,
    // Video and audio are upload-only: a link is never taken from the request, only kept if an older lesson had one.
    media_url:
      type === "text"
        ? null
        : type === "video" || type === "audio"
          ? (existing?.media_url ?? null)
          : input.mediaUrl.trim() || null,
    duration_minutes: input.durationMinutes.trim()
      ? Number(input.durationMinutes)
      : null,
    is_required: input.isRequired,
    is_free_preview: input.isFreePreview,
  };
  if (lessonId) {
    const { error } = await admin
      .from("lms_lessons")
      .update(row)
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .eq("organization_id", organizationId);
    if (error) return fail("Couldn't save the lesson. Please try again.");
  } else {
    const { count } = await admin
      .from("lms_lessons")
      .select("id", { count: "exact", head: true })
      .eq("module_id", moduleId);
    const { data: created, error } = await admin
      .from("lms_lessons")
      .insert({
        ...row,
        module_id: moduleId,
        course_id: courseId,
        organization_id: organizationId,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error || !created)
      return fail("Couldn't add the lesson. Please try again.");
    refresh(`/courses/${courseId}`);
    return { success: true, id: created.id };
  }
  refresh(`/courses/${courseId}`);
  return { success: true, id: lessonId ?? undefined };
}

export async function setLessonStatusAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
  status: LmsPublishState,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  if (!STATES.includes(status)) return fail("Choose a valid status.");
  const admin = createAdminClient();
  if (status === "published") {
    // A lesson with nothing to show can't go out to students.
    const { data: lesson } = await admin
      .from("lms_lessons")
      .select("content_type, file_path, media_url")
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!lesson) return fail("That lesson could not be found.");
    if (
      lesson.content_type !== "text" &&
      !lesson.file_path &&
      !lesson.media_url
    )
      return fail(
        lesson.content_type === "video" || lesson.content_type === "audio"
          ? "Upload the file for this lesson before publishing it."
          : "Add a link or a file to this lesson before publishing it.",
      );
  }
  const { error } = await admin
    .from("lms_lessons")
    .update({ status })
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't update the lesson. Please try again.");
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function deleteLessonAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("status")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson) return fail("That lesson could not be found.");
  if (!lessonDeletable(lesson.status))
    return fail("Archive a published lesson instead of deleting it.");
  const { count: progressRows } = await admin
    .from("lms_lesson_progress")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);
  if (progressRows)
    return fail(
      "Students have already opened this lesson. Archive it instead of deleting it.",
    );
  const { error } = await admin
    .from("lms_lessons")
    .delete()
    .eq("id", lessonId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't delete the lesson. Please try again.");
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function moveLessonAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
  direction: -1 | 1,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const { error } = await createAdminClient().rpc("lms_move_lesson", {
    p_organization_id: organizationId,
    p_lesson_id: lessonId,
    p_direction: direction,
  });
  if (error) return fail("Couldn't move the lesson. Please try again.");
  refresh(`/courses/${courseId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------------------------

// The database functions raise plain messages for rule breaks (course full, enrollment closed, ...);
// anything else is a real failure and gets a generic message.
function enrollmentMessage(message: string | undefined): string {
  const known = [
    "That course could not be found.",
    "This course is not open for enrollment.",
    "That student could not be found.",
    "Enrollment has not opened yet.",
    "Enrollment has closed.",
    "This student already has an open enrollment in the course.",
    "This course is full.",
    "That enrollment could not be found.",
  ];
  const hit = known.find((k) => message?.includes(k));
  if (hit) return hit;
  if (message?.includes("is not possible for an enrollment"))
    return "That change isn't possible for this enrollment.";
  return "Couldn't update the enrollment. Please try again.";
}

export async function enrollStudentAction(
  organizationId: string,
  courseId: string,
  memberId: string,
  status: "pending" | "approved",
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (status !== "pending" && status !== "approved")
    return fail("Choose pending or approved.");
  // An administrator enrolling someone directly may do so outside the open window.
  const { data, error } = await createAdminClient().rpc(
    "lms_create_enrollment",
    {
      p_organization_id: organizationId,
      p_course_id: courseId,
      p_member_id: memberId,
      p_status: status,
      p_source: "admin",
      p_actor: access.userId,
      p_ignore_window: true,
    },
  );
  if (error) return fail(enrollmentMessage(error.message));
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "enrollment.created",
    entityType: "enrollment",
    entityId: data as string,
    metadata: { courseId, memberId, status },
  });
  refresh("/enrollments", `/courses/${courseId}`);
  return { success: true, id: data as string };
}

export async function decideEnrollmentAction(
  organizationId: string,
  enrollmentId: string,
  action: EnrollmentAction,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  if (!["approve", "reject", "activate", "withdraw"].includes(action))
    return fail("Choose a valid action.");
  if (!(await owned("lms_enrollments", organizationId, enrollmentId)))
    return fail("That enrollment could not be found.");
  const { data, error } = await createAdminClient().rpc(
    "lms_decide_enrollment",
    {
      p_organization_id: organizationId,
      p_enrollment_id: enrollmentId,
      p_action: action,
      p_actor: access.userId,
    },
  );
  if (error) return fail(enrollmentMessage(error.message));
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: `enrollment.${action}`,
    entityType: "enrollment",
    entityId: enrollmentId,
    metadata: { status: data },
  });
  refresh("/enrollments");
  return { success: true };
}

// ---------------------------------------------------------------------------------------------
// Lesson files (private)
// ---------------------------------------------------------------------------------------------

const LESSON_BUCKET = "lms-lesson-files";

// Uploading a lesson file takes two steps, so that large videos go from the browser straight to storage
// instead of through the server: (1) the server checks the lesson, the file type and size and the
// church's storage, and returns a one-time upload link for a path it chose; (2) after the upload the
// server checks the object really is there and within its size limit, then attaches it. Students never
// get the storage path: the server hands out a short-lived link after checking that they may open the
// lesson (/api/mobile/lms/lesson-file).
export async function createLessonUploadAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
  file: { name: string; type: string; size: number },
): Promise<LmsResult & { path?: string; token?: string }> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("content_type")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson) return fail("Save the lesson first, then attach a file to it.");
  if (lesson.content_type === "text")
    return fail(
      "A reading lesson has no file. Use a video, audio, document or resource lesson.",
    );
  const problem = lessonFileProblem(file, lesson.content_type);
  if (problem) return fail(problem);
  const quota = await checkStorageQuota(organizationId, file.size);
  if (quota) return fail(quota);

  const rule = LESSON_FILE_RULES[file.type];
  const path = `${organizationId}/${courseId}/${lessonId}-${crypto.randomUUID()}.${rule.ext}`;
  const { data, error } = await admin.storage
    .from(LESSON_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return fail("Couldn't start the upload. Try again.");
  return { success: true, path, token: data.token };
}

export async function finalizeLessonUploadAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
  path: string,
  fileName: string,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  // Only a path this church's server handed out for this very lesson.
  const prefix = `${organizationId}/${courseId}/${lessonId}-`;
  if (!path.startsWith(prefix) || path.includes(".."))
    return fail("That upload isn't valid.");
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("file_path")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson) return fail("That lesson could not be found.");

  const folder = `${organizationId}/${courseId}`;
  const base = path.slice(folder.length + 1);
  const { data: found } = await admin.storage
    .from(LESSON_BUCKET)
    .list(folder, { search: base, limit: 5 });
  const object = (found ?? []).find((o) => o.name === base);
  if (!object) return fail("The upload didn't finish. Try again.");
  const ext = base.split(".").pop() ?? "";
  const rule = Object.values(LESSON_FILE_RULES).find((r) => r.ext === ext);
  const size = Number((object.metadata as { size?: number } | null)?.size ?? 0);
  if (!rule || size <= 0 || size > rule.maxBytes) {
    await admin.storage.from(LESSON_BUCKET).remove([path]);
    return fail("That file isn't allowed. Check its type and size.");
  }

  const { error } = await admin
    .from("lms_lessons")
    .update({ file_path: path, file_name: fileName.slice(0, 200) })
    .eq("id", lessonId)
    .eq("organization_id", organizationId);
  if (error) {
    await admin.storage.from(LESSON_BUCKET).remove([path]);
    return fail("Couldn't save the file. Try again.");
  }
  if (lesson.file_path && lesson.file_path !== path)
    await admin.storage.from(LESSON_BUCKET).remove([lesson.file_path]);
  refresh(`/courses/${courseId}`);
  return { success: true };
}

export async function removeLessonFileAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
): Promise<LmsResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("file_path, media_url")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson?.file_path) return fail("This lesson has no file.");
  if (!lesson.media_url)
    return fail(
      "Add a link to this lesson before removing its file, so it isn't left empty.",
    );
  const { error } = await admin
    .from("lms_lessons")
    .update({ file_path: null, file_name: null })
    .eq("id", lessonId)
    .eq("organization_id", organizationId);
  if (error) return fail("Couldn't remove the file. Try again.");
  await admin.storage.from(LESSON_BUCKET).remove([lesson.file_path]);
  refresh(`/courses/${courseId}`);
  return { success: true };
}
