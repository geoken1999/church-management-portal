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
