// Rules for a church's proof document. Pure, so they can be tested.
import type { TabKey } from "@/lib/permissions/tabs";

export const PROOF_BUCKET = "org-proofs";
export const PROOF_WINDOW_SECONDS = 120;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export type VerificationStatus = "not_submitted" | "under_review" | "verified" | "rejected";

// What stays closed until the church has sent its document: taking and sending money, and reaching people.
export const PROOF_LIMITED_TABS: TabKey[] = ["offerings", "donations", "fundraisers", "sms", "whatsapp", "email", "livestream"];

export const PROOF_LIMITED_MESSAGE = "Send your church's registration document in Profile to use this.";

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function proofContentType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" }[ext] ?? null;
}

export function proofProblem(file: { type: string; size: number }): string | null {
  if (!TYPES[file.type]) return "Upload a photo (JPG, PNG) or a PDF.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "That file is empty.";
  if (file.size > MAX_PROOF_BYTES) return "That file is too large. The limit is 5 MB.";
  return null;
}

// Always inside the church's own folder.
export function proofPath(organizationId: string, type: string, id: string): string {
  return `${organizationId}/${id}.${TYPES[type] ?? "bin"}`;
}

export function isOwnProofPath(path: string, organizationId: string): boolean {
  return path.startsWith(`${organizationId}/`) && !path.includes("..");
}

// Before migration 0225 is applied the column is missing, which must never close anything.
export function statusOf(value: string | null | undefined): VerificationStatus {
  return value === "not_submitted" || value === "under_review" || value === "rejected" ? value : "verified";
}

export function proofDeadline(startedAt: string): string {
  return new Date(new Date(startedAt).getTime() + PROOF_WINDOW_SECONDS * 1000).toISOString();
}

// Closed once the 2 minutes are over with no document, or after a rejection. A document under review lifts the limit
// while the platform admin looks at it. A church that has not opened the dashboard yet has no clock running.
export function proofLimited(input: { status: VerificationStatus; startedAt: string | null; now: number }): boolean {
  if (input.status === "verified" || input.status === "under_review") return false;
  if (input.status === "rejected") return true;
  if (!input.startedAt) return false;
  return input.now >= new Date(proofDeadline(input.startedAt)).getTime();
}
