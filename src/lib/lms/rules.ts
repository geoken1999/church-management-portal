// Pure rules for the Bible School module, so they are testable without a database. The database
// enforces the same rules in its own transactions (see migration 0190); these give friendly
// messages up front and drive what the screens offer.
import type { EnrollmentAction, EnrollmentStatus } from "@/lib/lms/constants";

// What an enrollment can change to. Mirrors lms_decide_enrollment in the database.
export function nextEnrollmentStatus(
  from: EnrollmentStatus,
  action: EnrollmentAction,
): EnrollmentStatus | null {
  if (action === "approve" && from === "pending") return "approved";
  if (action === "reject" && from === "pending") return "rejected";
  if (action === "activate" && from === "approved") return "active";
  if (
    action === "withdraw" &&
    (from === "pending" || from === "approved" || from === "active")
  )
    return "withdrawn";
  return null;
}

// The actions offered for an enrollment in a given state.
export function availableEnrollmentActions(
  status: EnrollmentStatus,
): EnrollmentAction[] {
  return (
    ["approve", "reject", "activate", "withdraw"] as EnrollmentAction[]
  ).filter((a) => nextEnrollmentStatus(status, a) !== null);
}

// A student counts toward a course's capacity once approved.
export function countsTowardCapacity(status: EnrollmentStatus): boolean {
  return status === "approved" || status === "active";
}

export interface EnrollmentWindow {
  enrollment_opens_at: string | null;
  enrollment_closes_at: string | null;
}

// Why enrollment can't happen right now, or null when it can.
export function enrollmentWindowProblem(
  course: EnrollmentWindow,
  now: Date,
): string | null {
  if (course.enrollment_opens_at && now < new Date(course.enrollment_opens_at))
    return "Enrollment has not opened yet.";
  if (
    course.enrollment_closes_at &&
    now > new Date(course.enrollment_closes_at)
  )
    return "Enrollment has closed.";
  return null;
}

export function courseIsFull(capacity: number | null, taken: number): boolean {
  return capacity !== null && taken >= capacity;
}

export interface TeacherCheck {
  /** Owner or admin of the church. */
  isAdmin: boolean;
  /** The person's access level on the Bible School tab. */
  canWrite: boolean;
  /** They are an assigned instructor of this course. */
  isAssignedInstructor: boolean;
}

// Who may change a course's content and roster: owners and admins, anyone given write access on the
// Bible School tab, and an instructor assigned to that very course.
export function canManageCourse(check: TeacherCheck): boolean {
  return check.isAdmin || check.canWrite || check.isAssignedInstructor;
}

// Whether a lesson may be deleted outright. Once published a lesson may already carry student
// progress (later phases), so it is archived instead.
export function lessonDeletable(status: string): boolean {
  return status === "draft";
}

// A student's progress through a course: the required lessons they have done out of all the required
// lessons. A course with no required lessons has nothing to finish, so it shows no progress.
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

// Whether the required lessons are all done. Mirrors lms_complete_lesson in the database: a course
// with no required lessons is never completed by this rule.
export function courseComplete(done: number, total: number): boolean {
  return total > 0 && done >= total;
}

export const LESSON_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
};

export const LESSON_FILE_MAX_BYTES = 25 * 1024 * 1024;
