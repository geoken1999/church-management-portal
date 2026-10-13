import { describe, expect, it } from "vitest";
import { parseVolunteerStatus, validateVolunteer } from "./validation";

const good = { memberId: "m1", role: "Usher", team: "Welcome", joinedOn: "2026-01-05", status: "active" };

describe("validateVolunteer", () => {
  it("accepts a complete volunteer", () => {
    expect(validateVolunteer(good)).toEqual({});
  });
  it("needs a member and a role", () => {
    expect(validateVolunteer({ ...good, memberId: "" }).memberId).toBeTruthy();
    expect(validateVolunteer({ ...good, role: " a " }).role).toBeTruthy();
  });
  it("rejects a date that isn't one, but allows none", () => {
    expect(validateVolunteer({ ...good, joinedOn: "not a date" }).joinedOn).toBeTruthy();
    expect(validateVolunteer({ ...good, joinedOn: "" })).toEqual({});
  });
});

describe("parseVolunteerStatus", () => {
  it("is active unless it says inactive", () => {
    expect(parseVolunteerStatus("inactive")).toBe("inactive");
    expect(parseVolunteerStatus("whatever")).toBe("active");
  });
});
