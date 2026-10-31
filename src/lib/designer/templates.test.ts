import { describe, expect, it } from "vitest";
import { SIZE_PRESETS, sanitizeDoc } from "./model";
import { TEMPLATES, buildTemplate } from "./templates";

describe("templates", () => {
  it("offers a 1280 × 720 YouTube thumbnail size", () => {
    const preset = SIZE_PRESETS.find((p) => p.key === "thumbnail");
    expect(preset).toMatchObject({ width: 1280, height: 720 });
  });

  it("builds every template at every preset size into a valid design", () => {
    for (const t of TEMPLATES) {
      for (const p of SIZE_PRESETS) {
        const doc = buildTemplate(t.key, p.width, p.height, "Grace Church");
        expect("error" in sanitizeDoc(doc)).toBe(false);
      }
    }
  });

  it("keeps the thumbnail templates inside the 16:9 page", () => {
    for (const t of TEMPLATES.filter((x) => x.key.startsWith("thumb-"))) {
      const doc = buildTemplate(t.key, 1280, 720, "Grace Church");
      for (const el of doc.elements.filter((e) => e.type === "text")) {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.x + el.w).toBeLessThanOrEqual(1280);
      }
    }
  });
});
