"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCurriculum, authorizeTab } from "@/lib/lms/authz";
import { logLmsEvent } from "@/lib/lms/audit";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import {
  hasQuizErrors,
  validateQuiz,
  type QuestionInput,
  type QuizErrors,
  type QuizInput,
} from "@/lib/lms/quiz";

export interface QuizResult {
  error?: string;
  errors?: QuizErrors;
  success?: boolean;
}

const fail = (error: string): QuizResult => ({ error });

export interface LoadedQuiz {
  quiz: QuizInput;
  /** Students have taken it: the questions can no longer be changed, only the settings. */
  locked: boolean;
}

// The quiz of a lesson, for the teacher's editor.
export async function loadQuizAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
): Promise<{ error?: string; loaded?: LoadedQuiz }> {
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
  if (!lesson || lesson.content_type !== "quiz")
    return { error: "That quiz could not be found." };
  const [{ data: settings }, { data: questions }, { count }] =
    await Promise.all([
      admin
        .from("lms_quizzes")
        .select("*")
        .eq("lesson_id", lessonId)
        .maybeSingle(),
      admin
        .from("lms_quiz_questions")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("position")
        .order("created_at"),
      admin
        .from("lms_quiz_attempts")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId),
    ]);
  return {
    loaded: {
      locked: (count ?? 0) > 0,
      quiz: {
        passPercent: settings?.pass_percent ?? 60,
        maxAttempts: settings ? settings.max_attempts : 3,
        showAnswers: settings?.show_answers ?? true,
        instructions: settings?.instructions ?? "",
        questions: (questions ?? []).map((q) => ({
          id: q.id,
          kind: q.kind,
          prompt: q.prompt,
          points: q.points,
          explanation: q.explanation ?? "",
          options: (q.options ?? []).map((o) => ({
            id: o.id,
            text: o.text,
            correct: Boolean(o.correct),
          })),
        })),
      },
    },
  };
}

function questionRows(
  questions: QuestionInput[],
  lessonId: string,
  organizationId: string,
) {
  return questions.map((q, position) => ({
    lesson_id: lessonId,
    organization_id: organizationId,
    position,
    kind: q.kind,
    prompt: q.prompt.trim(),
    points: q.points,
    explanation: q.explanation.trim() || null,
    options:
      q.kind === "short"
        ? []
        : q.options.map((o) => ({
            id: o.id,
            text:
              q.kind === "true_false"
                ? o.id === "true"
                  ? "True"
                  : "False"
                : o.text.trim(),
            correct: o.correct,
          })),
  }));
}

// Saves the settings and the whole list of questions in one go. Once a student has taken the quiz only the
// settings can change: new questions would not match the answers already given.
export async function saveQuizAction(
  organizationId: string,
  courseId: string,
  lessonId: string,
  input: QuizInput,
): Promise<QuizResult> {
  const access = await authorizeCurriculum(organizationId, courseId);
  if (!access.ok) return fail(access.message);
  const errors = validateQuiz(input);
  if (hasQuizErrors(errors)) return { errors };
  const admin = createAdminClient();
  const { data: lesson } = await admin
    .from("lms_lessons")
    .select("id, content_type")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!lesson || lesson.content_type !== "quiz")
    return fail("That quiz could not be found.");

  const { error: settingsError } = await admin.from("lms_quizzes").upsert(
    {
      lesson_id: lessonId,
      organization_id: organizationId,
      course_id: courseId,
      pass_percent: input.passPercent,
      max_attempts: input.maxAttempts,
      show_answers: input.showAnswers,
      instructions: input.instructions.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lesson_id" },
  );
  if (settingsError) return fail("Couldn't save the quiz. Please try again.");

  const { count } = await admin
    .from("lms_quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);
  if ((count ?? 0) === 0) {
    const { error: clearError } = await admin
      .from("lms_quiz_questions")
      .delete()
      .eq("lesson_id", lessonId);
    if (clearError)
      return fail("Couldn't save the questions. Please try again.");
    const { error: insertError } = await admin
      .from("lms_quiz_questions")
      .insert(questionRows(input.questions, lessonId, organizationId));
    if (insertError)
      return fail("Couldn't save the questions. Please try again.");
  }
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "quiz.saved",
    entityType: "lesson",
    entityId: lessonId,
  });
  revalidatePath(`${LMS_BASE_PATH}/courses/${courseId}`);
  return (count ?? 0) > 0
    ? {
        success: true,
        error:
          "Saved. Students have already taken this quiz, so the questions were left as they were.",
      }
    : { success: true };
}

// A teacher marks the written answers of one attempt.
export async function gradeAttemptAction(
  organizationId: string,
  attemptId: string,
  points: Record<string, number>,
  feedback: string,
): Promise<QuizResult> {
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("lms_quiz_attempts")
    .select("course_id")
    .eq("id", attemptId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!attempt) return fail("That attempt could not be found.");
  const access = await authorizeCurriculum(organizationId, attempt.course_id);
  if (!access.ok) return fail(access.message);
  if (feedback.length > 2000)
    return fail("Keep the feedback under 2000 characters.");
  const clean: Record<string, number> = {};
  for (const [id, value] of Object.entries(points))
    clean[id] = Number.isFinite(value) ? Math.max(0, value) : 0;
  const { error } = await admin.rpc("lms_grade_attempt", {
    p_org: organizationId,
    p_attempt: attemptId,
    p_points: clean,
    p_feedback: feedback,
    p_actor: access.userId,
  });
  if (error) return fail("Couldn't save the grade. Please try again.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "quiz.graded",
    entityType: "attempt",
    entityId: attemptId,
  });
  revalidatePath(`${LMS_BASE_PATH}/grading`);
  return { success: true };
}

// Takes a certificate back (for example one issued by mistake). The code then shows as revoked.
export async function revokeCertificateAction(
  organizationId: string,
  certificateId: string,
  reason: string,
): Promise<QuizResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return fail(access.message);
  const { data, error } = await createAdminClient()
    .from("lms_certificates")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason.trim().slice(0, 300) || null,
    })
    .eq("id", certificateId)
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return fail("That certificate could not be found or was already revoked.");
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "certificate.revoked",
    entityType: "certificate",
    entityId: certificateId,
  });
  revalidatePath(`${LMS_BASE_PATH}/certificates`);
  return { success: true };
}
