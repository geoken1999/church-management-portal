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
  {
    value: "public",
    label: "Open to the public (shown on your Bible School page)",
  },
] as const;

// Lesson types a teacher can create. assignment and live_session lessons are reserved in the database for
// later; live classes are scheduled on the course, not as a lesson.
export const LESSON_TYPES = [
  // needsLink: the lesson has to have a source (a link or an uploaded file) before it can be published.
  // Videos and audio are upload-only: they play inside the app and their progress is tracked, which a
  // link to another site cannot do. Older lessons that already carry a link keep working.
  {
    value: "text",
    label: "Reading",
    needsLink: false,
    allowsLink: false,
    allowsUpload: false,
  },
  {
    value: "video",
    label: "Video",
    needsLink: true,
    allowsLink: false,
    allowsUpload: true,
  },
  {
    value: "audio",
    label: "Audio",
    needsLink: true,
    allowsLink: false,
    allowsUpload: true,
  },
  {
    value: "document",
    label: "Document (PDF)",
    needsLink: true,
    allowsLink: true,
    allowsUpload: true,
  },
  {
    value: "resource",
    label: "Downloadable resource",
    needsLink: true,
    allowsLink: true,
    allowsUpload: true,
  },
  // A quiz has questions instead of content; passing it is what completes the lesson.
  {
    value: "quiz",
    label: "Quiz",
    needsLink: false,
    allowsLink: false,
    allowsUpload: false,
  },
  {
    value: "external",
    label: "External resource",
    needsLink: true,
    allowsLink: true,
    allowsUpload: false,
  },
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
