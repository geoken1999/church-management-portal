import { describe, it, expect } from "vitest";
import {
  validateWhatsAppBody,
  validateWhatsAppAccountSid,
  validateWhatsAppAuthToken,
  validateWhatsAppNumber,
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

describe("validateWhatsAppAccountSid / validateWhatsAppAuthToken", () => {
  it("reject empty values", () => {
    expect(validateWhatsAppAccountSid("")).toBeDefined();
    expect(validateWhatsAppAuthToken("")).toBeDefined();
  });

  it("accept non-empty values", () => {
    expect(validateWhatsAppAccountSid("ACxxxxxxxxxxxxxxxx")).toBeUndefined();
    expect(validateWhatsAppAuthToken("some-token")).toBeUndefined();
  });
});

describe("validateWhatsAppNumber", () => {
  it("rejects an empty number", () => {
    expect(validateWhatsAppNumber("")).toBeDefined();
  });

  it("rejects a number that doesn't parse as valid E.164", () => {
    expect(validateWhatsAppNumber("not-a-number")).toBeDefined();
  });

  it("accepts a valid E.164-parseable number", () => {
    expect(validateWhatsAppNumber("+14155552671")).toBeUndefined();
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
