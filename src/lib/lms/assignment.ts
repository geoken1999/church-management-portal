// Rules for assignments. Pure, so they can be tested without a database.

export const ASSIGNMENT_BUCKET = "lms-submissions";
export const MAX_SUBMISSION_BYTES = 25 * 1024 * 1024;
export const MAX_ANSWER_CHARS = 10000;

// What a student may hand in as a file: documents, slides, sheets, plain text, pictures and a zip.
const EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "rtf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "zip",
] as const;
export const SUBMISSION_FORMATS_LABEL =
  "PDF, Word, PowerPoint, Excel, text, pictures or a zip";

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

// What to check before a file is accepted for upload; null when it is fine.
export function submissionFileProblem(file: {
  name: string;
  size: number;
}): string | null {
  const ext = extensionOf(file.name);
  if (!(EXTENSIONS as readonly string[]).includes(ext))
    return `That file type isn't accepted. Use ${SUBMISSION_FORMATS_LABEL}.`;
  if (!(file.size > 0)) return "That file is empty.";
  if (file.size > MAX_SUBMISSION_BYTES)
    return "That file is too large. Keep it under 25 MB.";
  return null;
}

// A name safe to keep in a storage path: letters, digits, dots, dashes and underscores only.
export function safeFileName(fileName: string): string {
  const ext = extensionOf(fileName);
  const base = (ext ? fileName.slice(0, -(ext.length + 1)) : fileName)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

// Where a student's file goes: a folder per church, student and assignment, so a path says whose it is.
export function submissionPath(
  organizationId: string,
  memberId: string,
  lessonId: string,
  fileName: string,
  id: string,
): string {
  return `${organizationId}/${memberId}/${lessonId}/${id}-${safeFileName(fileName)}`;
}

export interface AssignmentInput {
  instructions: string;
  maxPoints: number;
  /** ISO date-time, or "" for no due date. */
  dueAt: string;
  allowText: boolean;
  allowFile: boolean;
}

export type AssignmentErrors = Partial<
  Record<"instructions" | "maxPoints" | "dueAt" | "allow", string>
>;

export function validateAssignment(input: AssignmentInput): AssignmentErrors {
  const errors: AssignmentErrors = {};
  const text = input.instructions.trim();
  if (text.length < 5)
    errors.instructions =
      "Tell students what to hand in (at least a sentence).";
  else if (text.length > 4000)
    errors.instructions = "Keep the instructions under 4000 characters.";
  if (
    !Number.isInteger(input.maxPoints) ||
    input.maxPoints < 1 ||
    input.maxPoints > 1000
  )
    errors.maxPoints = "Enter the marks it is out of, from 1 to 1000.";
  if (input.dueAt && Number.isNaN(new Date(input.dueAt).getTime()))
    errors.dueAt = "Enter a valid due date.";
  if (!input.allowText && !input.allowFile)
    errors.allow = "Let students hand in typed text, a file, or both.";
  return errors;
}

export const hasAssignmentErrors = (errors: AssignmentErrors) =>
  Object.keys(errors).length > 0;

// "17.5 / 20 (88%)" for the gradebook and the student's result.
export function markLabel(score: number, max: number): string {
  const percent = max > 0 ? Math.round((score / max) * 100) : 0;
  return `${Number.isInteger(score) ? score : score.toFixed(1)} / ${max} (${percent}%)`;
}
