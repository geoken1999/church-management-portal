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

export type LessonFileKind = "document" | "audio" | "video";

export interface LessonFileRule {
  ext: string;
  kind: LessonFileKind;
  maxBytes: number;
}

const MB = 1024 * 1024;

// What can be uploaded to a lesson, by file type: the extension it is stored with, what it is, and the
// largest size accepted. Videos are meant to be H.264 MP4 so every phone can play them.
export const LESSON_FILE_RULES: Record<string, LessonFileRule> = {
  "application/pdf": { ext: "pdf", kind: "document", maxBytes: 25 * MB },
  "application/msword": { ext: "doc", kind: "document", maxBytes: 25 * MB },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    kind: "document",
    maxBytes: 25 * MB,
  },
  "application/vnd.ms-powerpoint": {
    ext: "ppt",
    kind: "document",
    maxBytes: 25 * MB,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: "pptx",
    kind: "document",
    maxBytes: 25 * MB,
  },
  "application/vnd.ms-excel": {
    ext: "xls",
    kind: "document",
    maxBytes: 25 * MB,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: "xlsx",
    kind: "document",
    maxBytes: 25 * MB,
  },
  "audio/mpeg": { ext: "mp3", kind: "audio", maxBytes: 100 * MB },
  "audio/mp4": { ext: "m4a", kind: "audio", maxBytes: 100 * MB },
  "audio/x-m4a": { ext: "m4a", kind: "audio", maxBytes: 100 * MB },
  "video/mp4": { ext: "mp4", kind: "video", maxBytes: 500 * MB },
};

export const LESSON_FILE_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(LESSON_FILE_RULES).map(([type, rule]) => [type, rule.ext]),
);

export const LESSON_FILE_MAX_BYTES = 500 * MB;

// Why a file can't be attached to a lesson, or null when it can.
export function lessonFileProblem(
  file: { type: string; size: number },
  lessonType: string,
): string | null {
  const rule = LESSON_FILE_RULES[file.type];
  if (!rule)
    return "Use a PDF, Word, PowerPoint, Excel, MP3, M4A or MP4 (H.264) file.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > rule.maxBytes)
    return `That file is over ${Math.round(rule.maxBytes / MB)} MB, the limit for ${rule.kind === "document" ? "documents" : rule.kind}.`;
  if (lessonType === "video" && rule.kind !== "video")
    return "A video lesson needs an MP4 video file.";
  if (lessonType === "audio" && rule.kind !== "audio")
    return "An audio lesson needs an MP3 or M4A file.";
  if (
    (lessonType === "document" || lessonType === "resource") &&
    rule.kind !== "document"
  )
    return "A document lesson needs a PDF, Word, PowerPoint or Excel file.";
  return null;
}

// How much of a video or audio lesson has to be watched for it to complete by itself. Mirrors
// lms_save_playback in the database.
export const AUTO_COMPLETE_FRACTION = 0.9;

export function watchedEnough(
  watchedSeconds: number,
  durationSeconds: number,
): boolean {
  return (
    durationSeconds > 0 &&
    watchedSeconds >= Math.floor(durationSeconds * AUTO_COMPLETE_FRACTION)
  );
}

// The time to credit for a playback report: how far the position moved forward, but never more than
// the real time that passed at up to double speed (plus a little slack). Mirrors the database.
export function creditedSeconds(
  previousPosition: number,
  newPosition: number,
  elapsedSeconds: number,
): number {
  if (newPosition <= previousPosition) return 0;
  return Math.min(
    newPosition - previousPosition,
    Math.floor(Math.max(0, elapsedSeconds) * 2) + 2,
  );
}
