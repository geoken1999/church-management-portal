import { describe, it, expect } from "vitest";
import { buildDocFromAi, contrastRatio, estimateTextHeight, readableColor, MAX_AI_BLOCKS, PLACEHOLDER_IMAGE } from "./ai-layout";
import type { DesignElement } from "./model";

const make = (blocks: unknown[], extra: object = {}) =>
  JSON.stringify({ name: "Carol night", background: { type: "gradient", color: "#0b3d2e", color2: "#062219", angle: 170 }, align: "center", blocks, ...extra });

const headline = { type: "text", text: "Carol Service", size: "xl", fontFamily: "playfair", fontWeight: 900, color: "#ffffff" };
const detail = { type: "text", text: "24 December · 6:30 PM", size: "l", color: "#d4af37" };

function overlaps(a: DesignElement, b: DesignElement) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("buildDocFromAi", () => {
  it("lays blocks out top to bottom without overlap, inside the page", () => {
    const result = buildDocFromAi(make([headline, detail, { type: "text", text: "All are welcome", size: "m", color: "#fff" }]), 794, 1123, []);
    expect("doc" in result).toBe(true);
    if (!("doc" in result)) return;
    const texts = result.doc.elements.filter((e) => e.type === "text");
    expect(texts).toHaveLength(3);
    for (let i = 1; i < texts.length; i++) {
      expect(texts[i].y).toBeGreaterThanOrEqual(texts[i - 1].y + texts[i - 1].h);
      expect(overlaps(texts[i - 1], texts[i])).toBe(false);
    }
    for (const e of texts) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(794);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.y + e.h).toBeLessThanOrEqual(1123);
    }
  });

  it("shrinks a crowded page so it still fits", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ type: "text", text: `A line of text number ${i} that is fairly long and wraps over lines`, size: "l", color: "#fff" }));
    const result = buildDocFromAi(make(many), 794, 1123, []);
    expect("doc" in result).toBe(true);
    if (!("doc" in result)) return;
    const last = result.doc.elements[result.doc.elements.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(1123);
    const sizes = result.doc.elements.map((e) => e.fontSize ?? 0);
    expect(Math.min(...sizes)).toBeLessThan(0.075 * 794);
  });

  it("fixes text that can't be read on the background", () => {
    const result = buildDocFromAi(make([{ type: "text", text: "Hidden", size: "xl", color: "#0b3d2e" }]), 800, 1000, []);
    expect("doc" in result && result.doc.elements[0].fill).toBe("#ffffff");
    expect(readableColor("#222222", ["#ffffff"])).toBe("#222222");
    expect(readableColor("#eeeeee", ["#ffffff"])).toBe("#111111");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("places attached pictures in slots and ignores ones that weren't attached", () => {
    const result = buildDocFromAi(
      make([
        { type: "image", image: "image1", size: "l", shape: "rounded" },
        headline,
        { type: "image", image: "logo", size: "s" },
        { type: "image", image: "image9", size: "l" },
        { type: "image", image: "https://evil.example/x.png", size: "l" },
      ]),
      794,
      1123,
      [
        { ref: "image1", width: 1600, height: 1000 },
        { ref: "logo", width: 400, height: 400 },
      ],
    );
    expect("doc" in result).toBe(true);
    if (!("doc" in result)) return;
    expect(result.slots.map((s) => s.ref)).toEqual(["image1", "logo"]);
    const pics = result.doc.elements.filter((e) => e.type === "image");
    expect(pics).toHaveLength(2);
    expect(pics.every((e) => e.src === PLACEHOLDER_IMAGE)).toBe(true);
    expect(result.slots[0].elementId).toBe(pics[0].id);
    expect(pics[1].fit).toBe("contain");
  });

  it("adds accents behind the content", () => {
    const result = buildDocFromAi(
      make([headline], { accents: [{ kind: "frame", color: "#d4af37" }, { kind: "band_top", color: "#d4af37" }, { kind: "corner_icons", icon: "star", color: "#fff" }, { kind: "nonsense" }] }),
      794,
      1123,
      [],
    );
    expect("doc" in result).toBe(true);
    if (!("doc" in result)) return;
    const types = result.doc.elements.map((e) => e.type);
    expect(types[types.length - 1]).toBe("text");
    expect(types.filter((t) => t === "icon")).toHaveLength(2);
    const text = result.doc.elements.find((e) => e.type === "text")!;
    expect(text.y).toBeGreaterThan(1123 * 0.07); // below the top band
  });

  it("drops unusable blocks and falls back on bad values", () => {
    const result = buildDocFromAi(
      make([{ type: "text", text: "   " }, { type: "icon", icon: "dragon" }, { type: "video" }, null, { type: "text", text: "Hi", fontFamily: "comic", color: "url(x)", size: "huge" }]),
      800,
      1000,
      [],
    );
    expect("doc" in result).toBe(true);
    if (!("doc" in result)) return;
    expect(result.doc.elements).toHaveLength(1);
    expect(result.doc.elements[0].fontFamily).toBe("sans");
  });

  it("caps the number of blocks", () => {
    const many = Array.from({ length: 60 }, () => ({ type: "divider" }));
    const result = buildDocFromAi(make(many), 800, 1000, []);
    expect("doc" in result && result.doc.elements.length).toBe(MAX_AI_BLOCKS);
  });

  it("explains when the output isn't usable", () => {
    expect("error" in buildDocFromAi("not json", 800, 1000, [])).toBe(true);
    expect("error" in buildDocFromAi("[]", 800, 1000, [])).toBe(true);
    expect("error" in buildDocFromAi(make([]), 800, 1000, [])).toBe(true);
  });
});

describe("estimateTextHeight", () => {
  it("grows with more lines and narrower boxes", () => {
    const one = estimateTextHeight("Hello", 40, 600, 1.2);
    expect(one).toBe(48);
    expect(estimateTextHeight("Hello\nWorld", 40, 600, 1.2)).toBe(96);
    expect(estimateTextHeight("a long line of words that will wrap around", 40, 200, 1.2)).toBeGreaterThan(one * 3);
  });
});
