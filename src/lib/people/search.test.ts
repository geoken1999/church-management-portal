import { describe, expect, it } from "vitest";
import { matchesPerson, phoneDigits } from "./search";

const anna = {
  name: "Anna Thomas",
  phone: "+91 99876-04817",
  email: "anna@example.org",
};
const ben = { firstName: "Ben", lastName: "Joseph", phone: "9000011122" };

describe("people search", () => {
  it("finds by name, in any case, from any part", () => {
    expect(matchesPerson("anna", anna)).toBe(true);
    expect(matchesPerson("THOMAS", anna)).toBe(true);
    expect(matchesPerson("jose", ben)).toBe(true);
    expect(matchesPerson("carl", anna)).toBe(false);
  });
  it("finds by mobile number however it is written", () => {
    expect(matchesPerson("9987604817", anna)).toBe(true);
    expect(matchesPerson("99876 04817", anna)).toBe(true);
    expect(matchesPerson("+91-99876-04817", anna)).toBe(true);
    expect(matchesPerson("04817", anna)).toBe(true);
    expect(matchesPerson("9987604817", ben)).toBe(false);
  });
  it("combines a name and a number in one box", () => {
    expect(matchesPerson("anna 99876", anna)).toBe(true);
    expect(matchesPerson("anna 90000", anna)).toBe(false);
    expect(matchesPerson("ben 9000011122", ben)).toBe(true);
  });
  it("an empty box matches everyone and a person without a phone still matches by name", () => {
    expect(matchesPerson("  ", anna)).toBe(true);
    expect(matchesPerson("dev", { name: "Dev Kumar" })).toBe(true);
    expect(matchesPerson("12345", { name: "Dev Kumar", phone: null })).toBe(
      false,
    );
  });
  it("matches an email too", () => {
    expect(matchesPerson("@example.org", anna)).toBe(true);
  });
  it("digits helper", () => {
    expect(phoneDigits(" (+91) 99-876 ")).toBe("9199876");
    expect(phoneDigits(null)).toBe("");
  });
});
