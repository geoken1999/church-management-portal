"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";
import { authorizeCurriculum } from "@/lib/lms/authz";
import { logLmsEvent } from "@/lib/lms/audit";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import {
  ASSIGNMENT_BUCKET,
  hasAssignmentErrors,
  markLabel,
  validateAssignment,
  type AssignmentErrors,
  type AssignmentInput,
} from "@/lib/lms/assignment";

export interface AssignmentResult {
  error?: string;
  errors?: AssignmentErrors;
  success?: boolean;
}

const fail = (error: string): AssignmentResult => ({ error });

export interface LoadedAssignment {
  assignment: AssignmentInput;
  /** Students have handed in: the settings still change, but a smaller maximum could undercut marks given. */
  handedIn: number;
}

// "2025-03-01T10:30" in the church's own wall clock is not known here, so the due date travels as the
// ISO instant the browser made from the person's local time.
export async function loadAssignmentAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
): Promise<{ error?: string; loaded?: LoadedAssignment }> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("id, content_type")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson || lesson.content_type !== "assignment")
    return { error: "That assignment could not be found." };
  const [{ data: settings }, { count }] = await Promise.all([
    admin
      .from("lms_assignments")
      .select("*")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    admin
      .from("lms_assignment_submissions")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId),
  ]);
  return {
    loaded: {
      handedIn: count ?? 0,
      assignment: {
        instructions: settings?.instructions ?? "",
        maxPoints: settings?.max_points ?? 100,
        dueAt: settings?.due_at ?? "",
        allowText: settings?.allow_text ?? true,
        allowFile: settings?.allow_file ?? true,
      },
    },
  };
}

export async function saveAssignmentAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
  input: AssignmentInput,
): Promise<AssignmentResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const errors = validateAssignment(input);
  if (hasAssignmentErrors(errors)) return { errors };
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("id, content_type")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson || lesson.content_type !== "assignment")
    return fail("That assignment could not be found.");

  // Marks already given must stay inside the maximum.
  const { data: top } = await admin
    .from("lms_assignment_submissions")
    .select("score")
    .eq("lesson_id", lessonId)
    .eq("status", "graded")
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    top?.score !== null &&
    top?.score !== undefined &&
    Number(top.score) > input.maxPoints
  )
    return {
      errors: {
        maxPoints: `A student has already been given ${Number(top.score)}, so it can't be less than that.`,
      },
    };

  const { error } = await admin.from("lms_assignments").upsert(
    {
      lesson_id: lessonId,
      organization_id: organizationId,
      course_id: courseId,
      instructions: input.instructions.trim(),
      max_points: input.maxPoints,
      due_at: input.dueAt ? new Date(input.dueAt).toISOString() : null,
      allow_text: input.allowText,
      allow_file: input.allowFile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lesson_id" },
  );
  if (error) return fail("Couldn't save the assignment. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "assignment.saved",
    entityType: "lesson",
    entityId: lessonId,
  });
  revalidatePath(`${LMS_BASE_PATH}/courses/${courseId}`);
  return { success: true };
}

// A teacher marks one hand-in and the student is told.
export async function gradeSubmissionAction(
  organizationId: string,
  submissionId: string,
  score: number,
  feedback: string,
): Promise<AssignmentResult> {
  const admin = createAdminClient();
  const { data: submission } = await admin
    .from("lms_assignment_submissions")
    .select("course_id, member_id, lesson_id")
    .eq("id", submissionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!submission) return fail("That hand-in could not be found.");
  const access = await authorizeCurriculum(
    organizationId,
    submission.course_id,
  );
  if (!access.ok) return fail(access.message);
  if (!Number.isFinite(score)) return fail("Enter the mark.");
  if (feedback.length > 2000)
    return fail("Keep the feedback under 2000 characters.");

  const { data, error } = await admin.rpc("lms_grade_assignment", {
    p_org: organizationId,
    p_submission: submissionId,
    p_score: score,
    p_feedback: feedback,
    p_actor: access.userId,
  });
  if (error || !data)
    return fail(
      error?.message.includes("between 0 and")
        ? error.message.replace(/^.*(The mark must)/, "$1")
        : "Couldn't save the mark. Please try again.",
    );

  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "assignment.graded",
    entityType: "submission",
    entityId: submissionId,
  });
  // Telling the student is best effort: the mark is saved either way.
  try {
    const [{ data: member }, { data: lesson }] = await Promise.all([
      admin
        .from("members")
        .select("auth_user_id")
        .eq("id", submission.member_id)
        .maybeSingle(),
      admin
        .from("lms_lessons")
        .select("title")
        .eq("id", submission.lesson_id)
        .maybeSingle(),
    ]);
    if (member?.auth_user_id)
      await sendPushToUsers([member.auth_user_id], "event_update", {
        title: "Your assignment was marked",
        body: `${lesson?.title ?? "Assignment"}: ${markLabel(data.score, data.max_points)}`,
        data: {
          type: "lms_assignment",
          courseId: submission.course_id,
          lessonId: submission.lesson_id,
        },
      });
  } catch (err) {
    console.error("assignment graded notice failed:", err);
  }
  revalidatePath(`${LMS_BASE_PATH}/grading`);
  return { success: true };
}

const LINK_SECONDS = 300;

// A short-lived link to a student's file, for the teacher who may mark that course.
export async function submissionFileLinkAction(
  organizationId: string,
  submissionId: string,
): Promise<{ error?: string; url?: string; name?: string }> {
  const admin = createAdminClient();
  const { data: submission } = await admin
    .from("lms_assignment_submissions")
    .select("course_id, file_path, file_name")
    .eq("id", submissionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!submission?.file_path) return { error: "There is no file to open." };
  const access = await authorizeCurriculum(
    organizationId,
    submission.course_id,
  );
  if (!access.ok) return { error: access.message };
  const { data, error } = await admin.storage
    .from(ASSIGNMENT_BUCKET)
    .createSignedUrl(submission.file_path, LINK_SECONDS, {
      download: submission.file_name ?? true,
    });
  if (error || !data)
    return { error: "Couldn't open that file. Please try again." };
  return { url: data.signedUrl, name: submission.file_name ?? "File" };
}
