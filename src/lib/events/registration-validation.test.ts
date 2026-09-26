import { describe, it, expect } from "vitest";
import {
  hasEmailField,
  isProtectedField,
  validateRegistrationSettings,
  sanitizeRegistrationFields,
  DEFAULT_REGISTRATION_FIELDS,
} from "./registration-validation";

describe("hasEmailField", () => {
  it("is true when an email-type field is present", () => {
    expect(hasEmailField(DEFAULT_REGISTRATION_FIELDS)).toBe(true);
  });

  it("is false when no field is of type email", () => {
    expect(hasEmailField([{ key: "name", label: "Name", field_type: "text", options: null, required: true }])).toBe(false);
  });

  it("is false for an empty field list", () => {
    expect(hasEmailField([])).toBe(false);
  });
});

describe("validateRegistrationSettings", () => {
  const valid = { fields: DEFAULT_REGISTRATION_FIELDS, capacity: "", closesAt: "" };

  it("accepts a valid, unlimited-capacity, no-close-date setup", () => {
    expect(validateRegistrationSettings(valid)).toEqual({});
  });

  it("requires at least one email field", () => {
    const errors = validateRegistrationSettings({ ...valid, fields: [{ key: "name", label: "Name", field_type: "text", options: null, required: true }] });
    expect(errors.fields).toBeDefined();
  });

  it("rejects a non-positive capacity", () => {
    expect(validateRegistrationSettings({ ...valid, capacity: "0" }).capacity).toBeDefined();
    expect(validateRegistrationSettings({ ...valid, capacity: "-5" }).capacity).toBeDefined();
  });

  it("rejects a non-integer capacity", () => {
    expect(validateRegistrationSettings({ ...valid, capacity: "10.5" }).capacity).toBeDefined();
  });

  it("accepts a valid positive integer capacity", () => {
    expect(validateRegistrationSettings({ ...valid, capacity: "50" }).capacity).toBeUndefined();
  });

  it("rejects an invalid closesAt date", () => {
    expect(validateRegistrationSettings({ ...valid, closesAt: "not-a-date" }).closesAt).toBeDefined();
  });

  it("requires the Name and Phone fields too, not just Email", () => {
    const emailOnly = [{ key: "email", label: "Email", field_type: "email", options: null, required: true }] as const;
    const errors = validateRegistrationSettings({ ...valid, fields: [...emailOnly] });
    expect(errors.fields).toBeDefined();
    expect(errors.fields).toContain("Name");
    expect(errors.fields).toContain("Phone");
  });
});

describe("isProtectedField", () => {
  it("protects the default Name/Email/Phone keys", () => {
    for (const field of DEFAULT_REGISTRATION_FIELDS) {
      expect(isProtectedField(field)).toBe(true);
    }
  });

  it("does not protect a custom field", () => {
    expect(isProtectedField({ key: "t_shirt_size" })).toBe(false);
  });
});

describe("sanitizeRegistrationFields", () => {
  it("filters out malformed entries", () => {
    const result = sanitizeRegistrationFields([{ key: "email", label: "Email", field_type: "email", required: true }, { bogus: true }]);
    expect(result).toEqual([{ key: "email", label: "Email", field_type: "email", options: null, required: true, unique: false }]);
  });
});
