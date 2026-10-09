import { describe, expect, it } from "vitest";
import { validateProposedChanges, rejectDisallowedFields, isProfileUpdateField } from "@/lib/members/profile-update-requests";
import type { Member } from "@/types/database";

const BASE_MEMBER: Member = {
  id: "member-1",
  organization_id: "org-1",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  phone: "9876543210",
  status: "active",
  branch_id: null,
  date_of_birth: "1990-01-01",
  marital_status: "unmarried",
  wedding_date: null,
  baptism_date: null,
  membership_code: "membership-code-1",
  custom_fields: {},
  created_by: null,
  auth_user_id: "auth-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("isProfileUpdateField", () => {
  it("allows the five editable fields", () => {
    expect(isProfileUpdateField("first_name")).toBe(true);
    expect(isProfileUpdateField("wedding_date")).toBe(true);
  });

  it("refuses email and phone", () => {
    expect(isProfileUpdateField("email")).toBe(false);
    expect(isProfileUpdateField("phone")).toBe(false);
  });
});

describe("rejectDisallowedFields", () => {
  it("passes a change set using only allowed fields", () => {
    expect(rejectDisallowedFields({ first_name: "Janet" })).toBeNull();
  });

  it("names every disallowed field it finds", () => {
    expect(rejectDisallowedFields({ phone: "123", email: "x@y.com" })).toBe("These fields can't be changed this way: phone, email.");
  });
});

describe("validateProposedChanges", () => {
  it("accepts a simple name change", () => {
    expect(validateProposedChanges(BASE_MEMBER, { first_name: "Janet" })).toBeNull();
  });

  it("rejects a blank first name", () => {
    expect(validateProposedChanges(BASE_MEMBER, { first_name: "  " })).toBe("First name is required.");
  });

  it("rejects a date of birth in the future", () => {
    expect(validateProposedChanges(BASE_MEMBER, { date_of_birth: "2999-01-01" })).toBe("Date of birth cannot be in the future.");
  });

  it("requires a wedding date when switching to married", () => {
    expect(validateProposedChanges(BASE_MEMBER, { marital_status: "married" })).toBe(
      "Wedding date is required when marital status is Married.",
    );
  });

  it("accepts switching to married with a valid wedding date in the same request", () => {
    expect(validateProposedChanges(BASE_MEMBER, { marital_status: "married", wedding_date: "2015-06-01" })).toBeNull();
  });

  it("rejects a wedding date before the (unchanged) date of birth", () => {
    expect(validateProposedChanges(BASE_MEMBER, { marital_status: "married", wedding_date: "1980-01-01" })).toBe(
      "Wedding date cannot be before the date of birth.",
    );
  });

  it("rejects a wedding date in the future", () => {
    expect(validateProposedChanges(BASE_MEMBER, { marital_status: "married", wedding_date: "2999-01-01" })).toBe(
      "Wedding date cannot be in the future.",
    );
  });

  it("rejects providing a wedding date while unmarried", () => {
    expect(validateProposedChanges(BASE_MEMBER, { wedding_date: "2015-06-01" })).toBe(
      "Wedding date should be empty when marital status is Unmarried.",
    );
  });

  it("validates a wedding date against the CURRENT date of birth when only wedding_date changes for an already-married member", () => {
    const married: Member = { ...BASE_MEMBER, marital_status: "married", wedding_date: "2015-06-01" };
    expect(validateProposedChanges(married, { wedding_date: "1985-01-01" })).toBe("Wedding date cannot be before the date of birth.");
  });

  it("rejects an attempt to change email or phone alongside an allowed field", () => {
    expect(validateProposedChanges(BASE_MEMBER, { first_name: "Janet", phone: "123" } as never)).toBe(
      "These fields can't be changed this way: phone.",
    );
  });
});
