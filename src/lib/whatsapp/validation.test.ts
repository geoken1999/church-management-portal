import { describe, it, expect } from "vitest";
import { validateWhatsAppBody, validateWhatsAppTemplateName, validateWhatsAppTemplateBody, countTemplateVariables, normalizePhoneNumber } from "./validation";

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
