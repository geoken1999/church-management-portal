import { describe, expect, it } from "vitest";
import { cleanTheme, fontScale, withDefaults } from "@/lib/projection/theme";

describe("cleanTheme", () => {
  it("keeps plain colours and known fonts", () => {
    expect(cleanTheme({ background: "#1A2B3C", color: "#FFFFFF", font: "serif" })).toEqual({ background: "#1a2b3c", color: "#ffffff", font: "serif" });
  });
  it("drops anything that could carry markup or styles", () => {
    expect(cleanTheme({ background: "red; background:url(x)", color: "#fff", font: "Comic Sans" })).toEqual({});
    expect(cleanTheme(null)).toEqual({});
    expect(cleanTheme("x")).toEqual({});
  });
  it("fills in the defaults", () => {
    expect(withDefaults({ color: "#ff0000" })).toEqual({ background: "#000000", color: "#ff0000", font: "sans" });
  });
});

describe("fontScale", () => {
  it("is smaller for longer text, and smaller in the lower third", () => {
    expect(fontScale(30, "full")).toBeGreaterThan(fontScale(300, "full"));
    expect(fontScale(100, "lower_third")).toBeLessThan(fontScale(100, "full"));
  });
});
