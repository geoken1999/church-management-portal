import { describe, it, expect } from "vitest";
import {
  validateWhatsAppBody,
  validateWhatsAppTemplateName,
  validateWhatsAppTemplateBody,
  validateWhatsAppTemplatePlaceholders,
  countTemplateVariables,
  normalizePhoneNumber,
} from "./validation";

describe("validateWhatsAppBody", () => {
  it("rejects an empty message", () => {
    expect(validateWhatsAppBody("")).toBeDefined();
  });

  it("rejects a whitespace-only message", () => {
    expect(validateWhatsAppBody("   ")).toBeDefined();
  });

  it("accepts a non-empty message", () => {
    expect(validateWhatsAppBody("Hello!")).toBeUndefined();
  });
});

describe("validateWhatsAppTemplateName", () => {
  it("rejects an empty name", () => {
    expect(validateWhatsAppTemplateName("")).toBeDefined();
  });

  it("rejects a name with spaces or uppercase letters", () => {
    expect(validateWhatsAppTemplateName("Sunday Reminder")).toBeDefined();
  });

  it("accepts a lowercase, underscore-separated name", () => {
    expect(validateWhatsAppTemplateName("sunday_reminder")).toBeUndefined();
  });
});

describe("validateWhatsAppTemplateBody", () => {
  it("rejects an empty body", () => {
    expect(validateWhatsAppTemplateBody("")).toBeDefined();
  });

  it("accepts a non-empty body", () => {
    expect(validateWhatsAppTemplateBody("Hi {{1}}, see you Sunday!")).toBeUndefined();
  });

  it("rejects a named placeholder, not just an empty body", () => {
    expect(validateWhatsAppTemplateBody("Hi {{name}}, see you Sunday!")).toBeDefined();
  });
});

describe("validateWhatsAppTemplatePlaceholders", () => {
  it("rejects a named placeholder (the exact rejection a user hit live: Meta returns INVALID_FORMAT for this)", () => {
    const error = validateWhatsAppTemplatePlaceholders("Hi {{name}}, church service starts at 10 AM every Sunday.");
    expect(error).toBeDefined();
    expect(error).toContain("{{name}}");
    expect(error).toContain("{{1}}");
  });

  it("accepts sequential numbered placeholders starting at {{1}}", () => {
    expect(validateWhatsAppTemplatePlaceholders("Hi {{1}}, your order {{2}} ships {{3}}.")).toBeUndefined();
  });

  it("accepts a body with no placeholders at all", () => {
    expect(validateWhatsAppTemplatePlaceholders("See you Sunday!")).toBeUndefined();
  });

  it("rejects placeholders that skip a number", () => {
    const error = validateWhatsAppTemplatePlaceholders("Hi {{1}}, see you at {{3}}.");
    expect(error).toBeDefined();
    expect(error).toContain("{{1}}, {{3}}");
  });

  it("rejects placeholders that don't start at 1", () => {
    expect(validateWhatsAppTemplatePlaceholders("Hi {{2}}, see you Sunday.")).toBeDefined();
  });

  it("the error message itself never has mismatched braces", () => {
    const error = validateWhatsAppTemplatePlaceholders("Hi {{1}} and {{3}} and {{5}}.");
    expect(error).toBeDefined();
    expect((error!.match(/\{/g) ?? []).length).toBe((error!.match(/\}/g) ?? []).length);
  });
});

describe("countTemplateVariables", () => {
  it("returns 0 for a template with no placeholders", () => {
    expect(countTemplateVariables("See you Sunday!")).toBe(0);
  });

  it("returns the highest placeholder index used", () => {
    expect(countTemplateVariables("Hi {{1}}, your order {{2}} ships on {{3}}.")).toBe(3);
  });

  it("doesn't double-count a reused placeholder", () => {
    expect(countTemplateVariables("{{1}} and {{1}} again")).toBe(1);
  });
});

describe("normalizePhoneNumber re-export (sanity check it's wired correctly)", () => {
  it("normalizes a number with an explicit country code", () => {
    expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
  });

  it("returns null for an invalid number", () => {
    expect(normalizePhoneNumber("abc")).toBeNull();
  });
});
