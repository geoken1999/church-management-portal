"use client";

// The web student portal talks to the database the way the mobile app does: with the signed-in
// student's own session, through the Bible School functions. Every rule (who may see a course, open a
// lesson, join a class) is enforced by those functions, not here.

import { createClient } from "@/lib/supabase/client";

export interface PortalIdentity {
  memberId: string;
  organizationId: string;
  organizationName: string;
  firstName: string;
  lastName: string;
  kind: "member" | "student";
}

export interface PCourse {
  course_id: string;
  title: string;
  code: string | null;
  description: string | null;
  level: string;
  delivery_mode: string;
  estimated_hours: number | null;
  capacity: number | null;
  seats_taken: number;
  enrollment_opens_at: string | null;
  enrollment_closes_at: string | null;
  instructors: string | null;
  lesson_count: number;
  my_status: string | null;
  prerequisites_met: boolean;
  missing_prerequisites: string | null;
  price_amount: number | null;
}

export interface PProgram {
  program_id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  capacity: number | null;
  seats_taken: number;
  course_count: number;
  lesson_count: number;
  my_status: string | null;
  price_amount: number | null;
}

export interface PProgramCourse {
  course_id: string;
  title: string;
  description: string | null;
  course_position: number;
  is_required: boolean;
  lesson_count: number;
  my_status: string | null;
}

export interface PMyProgram {
  enrollment_id: string;
  program_id: string;
  title: string;
  status: string;
  courses_total: number;
  courses_done: number;
}

export interface PMyCourse {
  enrollment_id: string;
  course_id: string;
  title: string;
  status: string;
  required_total: number;
  required_done: number;
  last_lesson_id: string | null;
}

export interface POutlineItem {
  module_id: string;
  module_title: string;
  lesson_id: string;
  lesson_title: string;
  content_type: string;
  duration_minutes: number | null;
  is_required: boolean;
  is_free_preview: boolean;
  completed: boolean;
  locked: boolean;
}

export interface PLesson {
  id: string;
  course_id: string;
  title: string;
  content_type: string;
  body: string | null;
  media_url: string | null;
  file_name: string | null;
  has_file: boolean;
  duration_minutes: number | null;
  is_required: boolean;
  enrolled: boolean;
  completed: boolean;
  position_seconds: number;
  watched_seconds: number;
  duration_seconds: number | null;
  note: string;
  bookmarked: boolean;
}

export interface PQuizQuestion {
  id: string;
  kind: "single" | "multiple" | "true_false" | "short";
  prompt: string;
  points: number;
  options: { id: string; text: string }[];
}

export interface PAttempt {
  id: string;
  attempt_number: number;
  status: "submitted" | "graded";
  percent: number;
  passed: boolean;
  score: number;
  max_score: number;
  feedback: string | null;
  submitted_at: string;
  /** Present once the attempt is marked and the quiz shows answers. */
  detail:
    | {
        question_id: string;
        prompt: string;
        points: number;
        max_points: number;
        correct: boolean | null;
        feedback: string | null;
        correct_option_ids: string[];
        explanation: string | null;
      }[]
    | null;
}

export interface PQuiz {
  lesson_id: string;
  title: string;
  instructions: string | null;
  pass_percent: number;
  max_attempts: number | null;
  attempts_used: number;
  passed: boolean;
  waiting_for_teacher: boolean;
  best_percent: number | null;
  can_attempt: boolean;
  questions: PQuizQuestion[];
  last_attempt: PAttempt | null;
}

export interface PCertificate {
  id: string;
  code: string;
  title: string;
  kind: "course" | "program";
  percent: number | null;
  issued_at: string;
  organization_name: string;
}

export interface PSession {
  session_id: string;
  course_id: string;
  course_title: string;
  title: string;
  description: string | null;
  mode: string;
  starts_at: string;
  ends_at: string;
  status: string;
  can_join: boolean;
  my_attendance: string | null;
  recording_url: string | null;
}

export interface Playback {
  watched_seconds: number;
  duration_seconds: number;
  completed: boolean;
  course_completed: boolean;
}

export const supabase = () => createClient();

async function token(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

// The message the database raised, else a plain fallback.
export function portalError(
  error: unknown,
  fallback = "Couldn't do that. Please try again.",
): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message && !message.startsWith("{") && !message.includes("JWT"))
      return message;
  }
  return fallback;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // The generated types do not list every function's arguments loosely; the call is checked by the database.
  const { data, error } = await (
    supabase() as unknown as {
      rpc: (
        n: string,
        a: Record<string, unknown>,
      ) => Promise<{ data: T; error: { message: string } | null }>;
    }
  ).rpc(name, args);
  if (error) throw error;
  return data;
}

export const portal = {
  catalog: (org: string) => rpc<PCourse[]>("lms_catalog", { p_org: org }),
  myCourses: (org: string) =>
    rpc<PMyCourse[]>("lms_my_courses", { p_org: org }),
  programs: (org: string) =>
    rpc<PProgram[]>("lms_program_catalog", { p_org: org }),
  programCourses: (program: string) =>
    rpc<PProgramCourse[]>("lms_program_courses_list", { p_program: program }),
  myPrograms: (org: string) =>
    rpc<PMyProgram[]>("lms_my_programs", { p_org: org }),
  requestProgram: (program: string) =>
    rpc<string>("lms_request_program", { p_program: program }),
  courseProgram: (course: string) =>
    rpc<{ program_id: string; title: string }[]>("lms_course_program", {
      p_course: course,
    }),
  outline: (course: string) =>
    rpc<POutlineItem[]>("lms_course_outline", { p_course: course }),
  lesson: (lesson: string) =>
    rpc<PLesson>("lms_get_lesson", { p_lesson: lesson }),
  request: (course: string) =>
    rpc<string>("lms_request_enrollment", { p_course: course }),
  complete: (lesson: string, done: boolean) =>
    rpc<{
      required_total: number;
      required_done: number;
      course_completed: boolean;
    }>("lms_complete_lesson", { p_lesson: lesson, p_done: done }),
  playback: (lesson: string, position: number, duration: number) =>
    rpc<Playback>("lms_save_playback", {
      p_lesson: lesson,
      p_position: position,
      p_duration: duration,
    }),
  note: (lesson: string, note: string, bookmarked: boolean) =>
    rpc<void>("lms_save_note", {
      p_lesson: lesson,
      p_note: note,
      p_bookmarked: bookmarked,
    }),
  quiz: (lesson: string) => rpc<PQuiz>("lms_get_quiz", { p_lesson: lesson }),
  submitQuiz: (lesson: string, answers: Record<string, string[] | string>) =>
    rpc<PAttempt>("lms_submit_quiz", { p_lesson: lesson, p_answers: answers }),
  certificates: (org: string) =>
    rpc<PCertificate[]>("lms_my_certificates", { p_org: org }),
  sessions: (org: string) => rpc<PSession[]>("lms_my_sessions", { p_org: org }),
  join: (session: string) =>
    rpc<{ meeting_id: string; title: string; mode: string }>(
      "lms_join_session",
      { p_session: session },
    ),

  async fileLink(lessonId: string): Promise<{ url: string; name: string }> {
    const t = await token();
    const response = await fetch(
      `/api/mobile/lms/lesson-file?lessonId=${encodeURIComponent(lessonId)}`,
      {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      },
    );
    const json = await response.json();
    if (!json.ok) throw new Error(json.error ?? "Couldn't open that file.");
    return { url: json.url, name: json.name ?? "Lesson file" };
  },

  async checkoutUrl(programId: string): Promise<string> {
    const t = await token();
    const response = await fetch("/api/mobile/bible-school/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
      body: JSON.stringify({ programId }),
    });
    const json = await response.json();
    if (!json.ok) throw new Error(json.error ?? "Couldn't start the payment.");
    return json.url;
  },

  async identity(): Promise<PortalIdentity> {
    const t = await token();
    if (!t) throw new Error("Please sign in.");
    const response = await fetch("/api/mobile/member-auth/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
    });
    const json = await response.json();
    if (!json.ok)
      throw new Error(json.error ?? "Couldn't finish signing you in.");
    return {
      memberId: json.memberId,
      organizationId: json.organizationId,
      organizationName: json.organizationName ?? "",
      firstName: json.firstName ?? "",
      lastName: json.lastName ?? "",
      kind: json.kind === "student" ? "student" : "member",
    };
  },

  async checkPhone(phone: string): Promise<string> {
    const response = await fetch("/api/mobile/member-auth/check-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const json = await response.json();
    if (!json.ok)
      throw new Error(json.error ?? "That number couldn't be checked.");
    return json.organizationName ?? "";
  },
};

// A bare national number becomes the +91 form phone sign-in needs; a number starting with "+" is kept.
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d+]/g, "");
  return "+91" + trimmed.replace(/\D/g, "");
}
