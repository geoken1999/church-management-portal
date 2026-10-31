import { describe, expect, it } from "vitest";
import { CATEGORIES, buildStarterTemplates, orientationOf } from "./catalog";
import { sanitizeDoc } from "./model";

const all = buildStarterTemplates();

describe("starter library", () => {
  it("covers every category with unique slugs", () => {
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(CATEGORIES.length);
    expect(new Set(all.map((t) => t.slug)).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(150);
    for (const c of CATEGORIES) expect(all.some((t) => t.categorySlug === c.slug)).toBe(true);
  });

  it("builds designs the server accepts, at the size they claim", () => {
    for (const t of all) {
      const checked = sanitizeDoc(t.doc);
      expect("error" in checked, t.slug).toBe(false);
      expect(t.doc.width).toBe(t.width);
      expect(t.doc.height).toBe(t.height);
    }
  });

  it("keeps text and shapes on the page", () => {
    for (const t of all) {
      for (const el of t.doc.elements) {
        if (el.type === "ellipse" || (el.type === "icon" && el.opacity < 1)) continue; // decorative, may bleed
        if (el.type === "rect" && el.w >= t.width) continue;
        expect(el.x, `${t.slug} ${el.type} x`).toBeGreaterThanOrEqual(-1);
        expect(el.x + el.w, `${t.slug} ${el.type} right`).toBeLessThanOrEqual(t.width + 1);
        expect(el.y, `${t.slug} ${el.type} y`).toBeGreaterThanOrEqual(-1);
        expect(el.y + el.h, `${t.slug} ${el.type} bottom`).toBeLessThanOrEqual(t.height + 1);
      }
    }
  });

  it("classifies orientation", () => {
    expect(orientationOf(1280, 720)).toBe("landscape");
    expect(orientationOf(1080, 1350)).toBe("portrait");
    expect(orientationOf(1080, 1080)).toBe("square");
  });
});
