// Rules for the proof document a self-registered person uploads. Pure, so they can be tested.

export const PROOF_BUCKET = "member-proofs";
export const PROOF_WINDOW_SECONDS = 120;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export type VerificationStatus =
  | "not_submitted"
  | "under_review"
  | "verified"
  | "rejected";

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function proofProblem(file: { type: string; size: number }): string | null {
  if (!TYPES[file.type]) return "Upload a photo (JPG, PNG) or a PDF.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "That file is empty.";
  if (file.size > MAX_PROOF_BYTES) return "That file is too large. The limit is 5 MB.";
  return null;
}

// Always inside the member's own folder, so a path someone else made can be told apart.
export function proofPath(
  organizationId: string,
  memberId: string,
  type: string,
  id: string,
): string {
  return `${organizationId}/${memberId}/${id}.${TYPES[type] ?? "bin"}`;
}

export function isOwnProofPath(
  path: string,
  organizationId: string,
  memberId: string,
): boolean {
  return (
    path.startsWith(`${organizationId}/${memberId}/`) && !path.includes("..")
  );
}

export function proofDeadline(startedAt: string): string {
  return new Date(
    new Date(startedAt).getTime() + PROOF_WINDOW_SECONDS * 1000,
  ).toISOString();
}

// Features are limited once the 2 minutes are over and the church has neither the document nor a verdict on it.
// A document that is under review lifts the limit while the church looks at it.
export function proofLimited(input: {
  selfRegistered: boolean;
  status: VerificationStatus;
  deadlineAt: string | null;
  now: number;
}): boolean {
  if (!input.selfRegistered) return false;
  if (input.status === "verified" || input.status === "under_review") return false;
  if (input.status === "rejected") return true;
  if (!input.deadlineAt) return false;
  return input.now >= new Date(input.deadlineAt).getTime();
}
