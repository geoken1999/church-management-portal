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
    expect(withDefaults({ color: "#ff0000" })).toMatchObject({ background: "#000000", color: "#ff0000", font: "sans" });
  });
});

describe("banner", () => {
  it("keeps a plain https address and clamps the darkening", () => {
    expect(cleanTheme({ bannerImage: "https://x.supabase.co/storage/v1/object/public/projection-slides/a/b.jpg", bannerShade: 150 })).toEqual({
      bannerImage: "https://x.supabase.co/storage/v1/object/public/projection-slides/a/b.jpg",
      bannerShade: 100,
    });
  });
  it("refuses anything that could break out of url(...)", () => {
    expect(cleanTheme({ bannerImage: 'https://x.co/a.jpg");background:red' })).toEqual({});
    expect(cleanTheme({ bannerImage: "javascript:alert(1)" })).toEqual({});
    expect(cleanTheme({ bannerImage: "http://x.co/a.jpg" })).toEqual({});
  });
});

describe("banner placement", () => {
  it("keeps only known placements", () => {
    expect(cleanTheme({ bannerStyle: "below", bannerAlways: true })).toEqual({ bannerStyle: "below", bannerAlways: true });
    expect(cleanTheme({ bannerStyle: "over", bannerAlways: "yes" })).toEqual({});
  });
});

describe("fontScale", () => {
  it("is smaller for longer text, and smaller in the lower third", () => {
    expect(fontScale(30, "full")).toBeGreaterThan(fontScale(300, "full"));
    expect(fontScale(100, "lower_third")).toBeLessThan(fontScale(100, "full"));
  });

  it("keeps a clean picture library of at most 8, and drops bad addresses", () => {
    const url = (n: number) => `https://x.supabase.co/storage/v1/object/public/projection-slides/a/${n}.jpg`;
    const library = [{ name: "  Sunday  ", url: url(0) }, { name: "Bad", url: "javascript:alert(1)" }, ...Array.from({ length: 10 }, (_, n) => ({ name: "", url: url(n + 1) }))];
    const cleaned = cleanTheme({ bannerLibrary: library }).bannerLibrary ?? [];
    expect(cleaned).toHaveLength(8);
    expect(cleaned[0]).toEqual({ name: "Sunday", url: url(0) });
    expect(cleaned[1].name).toBe("Picture 2");
    expect(cleanTheme({ bannerLibrary: [{ name: "x", url: "http://x.co/a.jpg" }] })).toEqual({});
  });
});
