import { describe, expect, it } from "vitest";
import { countryName, initialsOf } from "./display";

describe("landing page church display", () => {
  it("makes initials from the first and last word", () => {
    expect(initialsOf("Grace Church")).toBe("GC");
    expect(initialsOf("New Life Church")).toBe("NC");
    expect(initialsOf("Jesus Redeems Youth Ministry - Maharashtra")).toBe("JM");
    expect(initialsOf("Bethel")).toBe("B");
    expect(initialsOf("  ")).toBe("?");
  });
  it("names the country, or nothing", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("us")).toBe("United States");
    expect(countryName(null)).toBe("");
    expect(countryName("India")).toBe("");
  });
});
