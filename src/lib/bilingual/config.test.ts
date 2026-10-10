import { describe, it, expect } from "vitest";
import { bilingualText, collectTranslatableStrings, sanitizeBilingual } from "./config";

describe("sanitizeBilingual", () => {
  it("accepts two different supported languages", () => {
    expect(sanitizeBilingual({ source: "en", target: "hi", translations: { Name: " नाम " } })).toEqual({ source: "en", target: "hi", translations: { Name: "नाम" } });
  });

  it("rejects the same language twice, unknown languages and junk", () => {
    expect(sanitizeBilingual({ source: "en", target: "en" })).toBeNull();
    expect(sanitizeBilingual({ source: "en", target: "fr" })).toBeNull();
    expect(sanitizeBilingual(null)).toBeNull();
    expect(sanitizeBilingual("en")).toBeNull();
  });

  it("drops non-string and empty translations", () => {
    const config = sanitizeBilingual({ source: "en", target: "ta", translations: { A: 5, B: "", C: "ok" } });
    expect(config?.translations).toEqual({ C: "ok" });
  });
});

describe("bilingualText", () => {
  const config = { source: "en", target: "hi", translations: { Name: "नाम", Same: "same" } } as const;

  it("joins the original and its translation", () => {
    expect(bilingualText("Name", { ...config })).toBe("Name / नाम");
  });

  it("returns plain text when there is no translation, or it is identical", () => {
    expect(bilingualText("Age", { ...config })).toBe("Age");
    expect(bilingualText("Same", { ...config })).toBe("Same");
    expect(bilingualText("Name", null)).toBe("Name");
  });
});

describe("collectTranslatableStrings", () => {
  it("collects title, description, labels and options once, skipping numbers", () => {
    const strings = collectTranslatableStrings({
      title: "Camp",
      description: "Join us",
      fields: [
        { label: "Name" },
        { label: "Name" },
        { label: "Gender", options: ["Male", "Female"] },
        { label: "2026" },
      ],
    });
    expect(strings).toEqual(["Camp", "Join us", "Name", "Gender", "Male", "Female"]);
  });
});
