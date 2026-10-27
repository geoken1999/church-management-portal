import { describe, expect, it } from "vitest";
import { isOwnProofPath, proofContentType, proofDeadline, proofLimited, proofPath, proofProblem } from "./proof";

describe("church proof document rules", () => {
  it("accepts photos and PDFs within 5 MB, refuses the rest", () => {
    expect(proofProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(proofProblem({ type: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
    expect(proofProblem({ type: "text/html", size: 10 })).not.toBeNull();
    expect(proofProblem({ type: "image/png", size: 0 })).not.toBeNull();
    expect(proofProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });
  it("reads the type from the file name", () => {
    expect(proofContentType("Certificate.PDF")).toBe("application/pdf");
    expect(proofContentType("scan.jpeg")).toBe("image/jpeg");
    expect(proofContentType("notes.docx")).toBeNull();
  });
  it("keeps paths in the church's own folder", () => {
    const path = proofPath("org", "image/png", "abc");
    expect(path).toBe("org/abc.png");
    expect(isOwnProofPath(path, "org")).toBe(true);
    expect(isOwnProofPath("other/abc.png", "org")).toBe(false);
    expect(isOwnProofPath("org/../x.png", "org")).toBe(false);
  });
  it("gives 2 months, then closes features until a document is sent", () => {
    const startedAt = "2026-10-27T10:00:00.000Z";
    expect(proofDeadline(startedAt)).toBe("2026-12-27T10:00:00.000Z");
    const t = (s: string) => new Date(s).getTime();
    expect(proofLimited({ status: "not_submitted", startedAt: null, now: Infinity })).toBe(false);
    expect(proofLimited({ status: "not_submitted", startedAt, now: t("2026-12-27T09:59:59.000Z") })).toBe(false);
    expect(proofLimited({ status: "not_submitted", startedAt, now: t("2026-12-27T10:00:00.000Z") })).toBe(true);
    expect(proofLimited({ status: "under_review", startedAt, now: t("2027-03-01T00:00:00.000Z") })).toBe(false);
    expect(proofLimited({ status: "verified", startedAt, now: t("2027-03-01T00:00:00.000Z") })).toBe(false);
    // A rejection inside the 2 months does not close anything yet; the church still has time to send another.
    expect(proofLimited({ status: "rejected", startedAt, now: t("2026-11-01T00:00:00.000Z") })).toBe(false);
    expect(proofLimited({ status: "rejected", startedAt, now: t("2026-12-28T00:00:00.000Z") })).toBe(true);
  });
});
