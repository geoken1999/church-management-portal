// Plain constants for the Bible School (LMS) module; safe to import anywhere.

export const COURSE_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export const DELIVERY_MODES = [
  { value: "self_paced", label: "Self-paced" },
  { value: "instructor_led", label: "Instructor-led" },
  { value: "blended", label: "Blended" },
] as const;

export const PUBLISH_STATES = ["draft", "published", "archived"] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

export const VISIBILITIES = [
  { value: "organization", label: "Everyone in the church" },
  { value: "unlisted", label: "Only people with the link" },
] as const;

// Lesson types a teacher can create now. quiz, assignment and live_session lessons arrive with the
// phases that build quizzes, assignments and live classes; the database already reserves them.
export const LESSON_TYPES = [
  { value: "text", label: "Reading", needsLink: false },
  { value: "video", label: "Video", needsLink: true },
  { value: "audio", label: "Audio", needsLink: true },
  { value: "document", label: "Document (PDF)", needsLink: true },
  { value: "resource", label: "Downloadable resource", needsLink: true },
  { value: "external", label: "External resource", needsLink: true },
] as const;

export type LessonType = (typeof LESSON_TYPES)[number]["value"];

export const ENROLLMENT_STATUSES = [
  "pending",
  "approved",
  "active",
  "completed",
  "withdrawn",
  "rejected",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_LABELS: Record<EnrollmentStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  active: "Active",
  completed: "Completed",
  withdrawn: "Withdrawn",
  rejected: "Rejected",
};

export type EnrollmentAction = "approve" | "reject" | "activate" | "withdraw";

export const LMS_BASE_PATH = "/dashboard/bible-school";
