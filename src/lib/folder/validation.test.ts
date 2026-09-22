import { describe, it, expect } from "vitest";
import { documentExtension, validateDocumentTitle, validateCategoryName, ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "./validation";

describe("documentExtension", () => {
  it("maps every allowed mime type to a non-empty extension", () => {
    for (const type of ALLOWED_DOCUMENT_TYPES) {
      expect(documentExtension(type)).toMatch(/^\.[a-z]+$/);
    }
  });

  it("returns an empty string for an unrecognized mime type", () => {
    expect(documentExtension("application/x-msdownload")).toBe("");
  });

  it("is case-sensitive (mime types are lowercase by convention)", () => {
    expect(documentExtension("application/PDF")).toBe("");
  });
});

describe("validateDocumentTitle", () => {
  it("rejects an empty title", () => {
    expect(validateDocumentTitle("")).toBeDefined();
  });

  it("rejects a whitespace-only title", () => {
    expect(validateDocumentTitle("   ")).toBeDefined();
  });

  it("rejects a single-character title", () => {
    expect(validateDocumentTitle("A")).toBeDefined();
  });

  it("accepts a two-character title (the minimum)", () => {
    expect(validateDocumentTitle("Ab")).toBeUndefined();
  });

  it("accepts a title padded with whitespace, trimming before the length check", () => {
    expect(validateDocumentTitle("  Board minutes  ")).toBeUndefined();
  });
});

describe("validateCategoryName", () => {
  it("rejects an empty name", () => {
    expect(validateCategoryName("")).toBeDefined();
  });

  it("rejects a one-character name", () => {
    expect(validateCategoryName("X")).toBeDefined();
  });

  it("accepts a valid category name", () => {
    expect(validateCategoryName("Youth Ministry")).toBeUndefined();
  });
});

describe("MAX_DOCUMENT_BYTES", () => {
  it("is 25MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});
