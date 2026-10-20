import { describe, expect, it } from "vitest";
import {
  extensionOf,
  hasAssignmentErrors,
  markLabel,
  safeFileName,
  submissionFileProblem,
  submissionPath,
  validateAssignment,
} from "./assignment";

describe("assignment files", () => {
  it("accepts documents and pictures, refuses programs", () => {
    expect(submissionFileProblem({ name: "essay.PDF", size: 1000 })).toBeNull();
    expect(
      submissionFileProblem({ name: "photo.heic", size: 1000 }),
    ).toBeNull();
    expect(submissionFileProblem({ name: "run.exe", size: 1000 })).toMatch(
      /isn't accepted/,
    );
    expect(submissionFileProblem({ name: "noextension", size: 1000 })).toMatch(
      /isn't accepted/,
    );
  });
  it("refuses empty and oversized files", () => {
    expect(submissionFileProblem({ name: "a.pdf", size: 0 })).toMatch(/empty/);
    expect(
      submissionFileProblem({ name: "a.pdf", size: 26 * 1024 * 1024 }),
    ).toMatch(/too large/);
  });
  it("keeps paths safe and inside the student's own folder", () => {
    expect(extensionOf("My Essay.final.DOCX")).toBe("docx");
    expect(safeFileName("../../My Essay (final).docx")).toBe(
      "My-Essay-final.docx",
    );
    expect(safeFileName("???.pdf")).toBe("file.pdf");
    expect(submissionPath("org", "mem", "les", "../x.pdf", "id1")).toBe(
      "org/mem/les/id1-x.pdf",
    );
  });
});

describe("assignment settings", () => {
  const ok = {
    instructions: "Write 500 words on grace.",
    maxPoints: 20,
    dueAt: "",
    allowText: true,
    allowFile: false,
  };
  it("accepts a normal assignment", () => {
    expect(hasAssignmentErrors(validateAssignment(ok))).toBe(false);
  });
  it("needs instructions, sensible marks and a way to hand in", () => {
    expect(
      validateAssignment({ ...ok, instructions: " hi " }).instructions,
    ).toBeDefined();
    expect(validateAssignment({ ...ok, maxPoints: 0 }).maxPoints).toBeDefined();
    expect(
      validateAssignment({ ...ok, maxPoints: 2.5 }).maxPoints,
    ).toBeDefined();
    expect(
      validateAssignment({ ...ok, dueAt: "not a date" }).dueAt,
    ).toBeDefined();
    expect(
      validateAssignment({ ...ok, allowText: false, allowFile: false }).allow,
    ).toBeDefined();
  });
  it("describes a mark", () => {
    expect(markLabel(17.5, 20)).toBe("17.5 / 20 (88%)");
    expect(markLabel(20, 20)).toBe("20 / 20 (100%)");
  });
});
