import { describe, expect, it } from "vitest";
import {
  isOwnProofPath,
  proofDeadline,
  proofLimited,
  proofPath,
  proofProblem,
} from "./proof";

describe("proof document rules", () => {
  it("accepts photos and PDFs within 5 MB", () => {
    expect(proofProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(proofProblem({ type: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
  });
  it("refuses other types, empty and oversize files", () => {
    expect(proofProblem({ type: "text/html", size: 10 })).not.toBeNull();
    expect(proofProblem({ type: "image/png", size: 0 })).not.toBeNull();
    expect(proofProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });
  it("keeps paths in the member's own folder", () => {
    const path = proofPath("org", "mem", "image/png", "abc");
    expect(path).toBe("org/mem/abc.png");
    expect(isOwnProofPath(path, "org", "mem")).toBe(true);
    expect(isOwnProofPath("org/other/abc.png", "org", "mem")).toBe(false);
    expect(isOwnProofPath("org/mem/../x.png", "org", "mem")).toBe(false);
  });
  it("gives 2 minutes", () => {
    expect(proofDeadline("2026-10-27T10:00:00.000Z")).toBe("2026-10-27T10:02:00.000Z");
  });
  it("limits features only after the deadline without a document, or after a rejection", () => {
    const deadlineAt = "2026-10-27T10:02:00.000Z";
    const t = (s: string) => new Date(s).getTime();
    const base = { selfRegistered: true, deadlineAt };
    expect(proofLimited({ ...base, status: "not_submitted", now: t("2026-10-27T10:01:00.000Z") })).toBe(false);
    expect(proofLimited({ ...base, status: "not_submitted", now: t("2026-10-27T10:02:00.000Z") })).toBe(true);
    expect(proofLimited({ ...base, status: "under_review", now: t("2026-10-27T11:00:00.000Z") })).toBe(false);
    expect(proofLimited({ ...base, status: "verified", now: t("2026-10-27T11:00:00.000Z") })).toBe(false);
    expect(proofLimited({ ...base, status: "rejected", now: t("2026-10-27T10:00:10.000Z") })).toBe(true);
    expect(proofLimited({ selfRegistered: false, status: "not_submitted", deadlineAt, now: Infinity })).toBe(false);
  });
});
