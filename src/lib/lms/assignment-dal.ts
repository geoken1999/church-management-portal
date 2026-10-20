import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface SubmissionRow {
  id: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  studentName: string;
  studentPhone: string | null;
  instructions: string;
  maxPoints: number;
  dueAt: string | null;
  answerText: string | null;
  fileName: string | null;
  fileSize: number | null;
  submittedAt: string;
  isLate: boolean;
  status: "submitted" | "graded";
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
}

async function describe(
  rows: {
    id: string;
    course_id: string;
    lesson_id: string;
    member_id: string;
    answer_text: string | null;
    file_name: string | null;
    file_size: number | null;
    submitted_at: string;
    is_late: boolean;
    status: "submitted" | "graded";
    score: number | null;
    feedback: string | null;
    graded_at: string | null;
  }[],
): Promise<SubmissionRow[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const lessonIds = [...new Set(rows.map((r) => r.lesson_id))];
  const [
    { data: lessons },
    { data: courses },
    { data: members },
    { data: briefs },
  ] = await Promise.all([
    admin.from("lms_lessons").select("id, title").in("id", lessonIds),
    admin
      .from("lms_courses")
      .select("id, title")
      .in("id", [...new Set(rows.map((r) => r.course_id))]),
    admin
      .from("members")
      .select("id, first_name, last_name, phone")
      .in("id", [...new Set(rows.map((r) => r.member_id))]),
    admin
      .from("lms_assignments")
      .select("lesson_id, instructions, max_points, due_at")
      .in("lesson_id", lessonIds),
  ]);
  return rows.map((r) => {
    const member = (members ?? []).find((m) => m.id === r.member_id);
    const brief = (briefs ?? []).find((b) => b.lesson_id === r.lesson_id);
    return {
      id: r.id,
      courseId: r.course_id,
      courseTitle:
        (courses ?? []).find((c) => c.id === r.course_id)?.title ?? "Course",
      lessonTitle:
        (lessons ?? []).find((l) => l.id === r.lesson_id)?.title ??
        "Assignment",
      studentName: member
        ? `${member.first_name} ${member.last_name}`.trim()
        : "Student",
      studentPhone: member?.phone ?? null,
      instructions: brief?.instructions ?? "",
      maxPoints: brief?.max_points ?? 0,
      dueAt: brief?.due_at ?? null,
      answerText: r.answer_text,
      fileName: r.file_name,
      fileSize: r.file_size,
      submittedAt: r.submitted_at,
      isLate: r.is_late,
      status: r.status,
      score: r.score === null ? null : Number(r.score),
      feedback: r.feedback,
      gradedAt: r.graded_at,
    };
  });
}

const COLUMNS =
  "id, course_id, lesson_id, member_id, answer_text, file_name, file_size, submitted_at, is_late, status, score, feedback, graded_at";

// Hand-ins waiting for a mark, oldest first. An instructor sees only the courses they teach.
export async function getWaitingSubmissions(
  organizationId: string,
  onlyCourseIds?: string[],
): Promise<SubmissionRow[]> {
  if (onlyCourseIds && onlyCourseIds.length === 0) return [];
  let query = createAdminClient()
    .from("lms_assignment_submissions")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "submitted")
    .order("submitted_at")
    .limit(200);
  if (onlyCourseIds) query = query.in("course_id", onlyCourseIds);
  const { data } = await query;
  return describe(data ?? []);
}

// The latest marked hand-ins, so a mark can be checked or corrected.
export async function getMarkedSubmissions(
  organizationId: string,
  onlyCourseIds?: string[],
): Promise<SubmissionRow[]> {
  if (onlyCourseIds && onlyCourseIds.length === 0) return [];
  let query = createAdminClient()
    .from("lms_assignment_submissions")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "graded")
    .order("graded_at", { ascending: false })
    .limit(30);
  if (onlyCourseIds) query = query.in("course_id", onlyCourseIds);
  const { data } = await query;
  return describe(data ?? []);
}
