import { describe, it, expect } from "vitest";
import { validateSessionTitle, validateOccurrenceDate, validateHeadcount } from "./validation";

describe("validateSessionTitle", () => {
  it("rejects an empty title", () => {
    expect(validateSessionTitle("")).toBeDefined();
  });

  it("rejects a one-character title", () => {
    expect(validateSessionTitle("A")).toBeDefined();
  });

  it("accepts a valid title", () => {
    expect(validateSessionTitle("Sunday Service")).toBeUndefined();
  });
});

describe("validateOccurrenceDate", () => {
  it("rejects an empty string", () => {
    expect(validateOccurrenceDate("")).toBeDefined();
  });

  it("rejects a non-date string", () => {
    expect(validateOccurrenceDate("not-a-date")).toBeDefined();
  });

  it("accepts a well-formed ISO date", () => {
    expect(validateOccurrenceDate("2026-03-15")).toBeUndefined();
  });
});

describe("validateHeadcount", () => {
  it("accepts an empty string — headcount is optional", () => {
    expect(validateHeadcount("")).toBeUndefined();
  });

  it("accepts zero", () => {
    expect(validateHeadcount("0")).toBeUndefined();
  });

  it("accepts a positive whole number", () => {
    expect(validateHeadcount("150")).toBeUndefined();
  });

  it("rejects a negative number", () => {
    expect(validateHeadcount("-5")).toBeDefined();
  });

  it("rejects a decimal value", () => {
    expect(validateHeadcount("12.5")).toBeDefined();
  });

  it("rejects a non-numeric string", () => {
    expect(validateHeadcount("abc")).toBeDefined();
  });
});
