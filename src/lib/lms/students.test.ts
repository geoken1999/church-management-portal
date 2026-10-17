import { describe, expect, it } from "vitest";
import {
  explainExistingPerson,
  publicSchoolPath,
  validateApplication,
} from "./students";

const good = {
  firstName: "Ruth",
  lastName: "Mathew",
  phone: "98765 43210",
  email: "",
  message: "",
  courseId: "c1",
};

describe("validateApplication", () => {
  it("accepts a complete application", () => {
    expect(validateApplication(good)).toEqual({});
  });
  it("asks for names and a 10-digit phone", () => {
    const e = validateApplication({
      ...good,
      firstName: " ",
      lastName: "",
      phone: "123",
    });
    expect(e.firstName).toBeDefined();
    expect(e.lastName).toBeDefined();
    expect(e.phone).toBeDefined();
  });
  it("checks an email only when one is given", () => {
    expect(validateApplication({ ...good, email: "nope" }).email).toBeDefined();
    expect(
      validateApplication({ ...good, email: "a@b.co" }).email,
    ).toBeUndefined();
  });
  it("limits the message length", () => {
    expect(
      validateApplication({ ...good, message: "x".repeat(501) }).message,
    ).toBeDefined();
  });
});

describe("explainExistingPerson", () => {
  it("explains members, students and pending people; others may apply", () => {
    expect(explainExistingPerson("active")).toMatch(/membership/);
    expect(explainExistingPerson("student")).toMatch(/registered/);
    expect(explainExistingPerson("pending")).toMatch(/review/);
    expect(explainExistingPerson("left")).toBeNull();
    expect(explainExistingPerson(null)).toBeNull();
  });
});

it("builds the public page path", () => {
  expect(publicSchoolPath("grace")).toBe("/bible-school/grace");
});
