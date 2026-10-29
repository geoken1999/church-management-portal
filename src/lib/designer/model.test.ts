import { describe, it, expect } from "vitest";
import { alignElements, distributeElements, googleFontsUrl, makeIcon, FONTS, backgroundCss, clamp, duplicateElement, makeShape, makeText, reorder, sanitizeDoc, safeColor, emptyDoc } from "./model";
import { TEMPLATES, buildTemplate } from "./templates";

const page = { width: 800, height: 1000 };

describe("reorder", () => {
  const els = ["a", "b", "c"].map((id) => ({ ...makeShape("rect", page), id }));
  it("moves an element forward, backward, to front and to back", () => {
    expect(reorder(els, "a", "forward").map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(reorder(els, "c", "backward").map((e) => e.id)).toEqual(["a", "c", "b"]);
    expect(reorder(els, "a", "front").map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(reorder(els, "c", "back").map((e) => e.id)).toEqual(["c", "a", "b"]);
  });
  it("leaves the list alone for an unknown id or an element already at the end", () => {
    expect(reorder(els, "zzz", "front")).toBe(els);
    expect(reorder(els, "c", "forward").map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});

describe("helpers", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
  it("duplicates with a new id and an offset", () => {
    const el = makeText(page, "Hi");
    const copy = duplicateElement(el);
    expect(copy.id).not.toBe(el.id);
    expect(copy.x).toBe(el.x + 20);
  });
  it("builds gradient and solid backgrounds", () => {
    expect(backgroundCss({ type: "solid", color: "#fff" })).toBe("#fff");
    expect(backgroundCss({ type: "gradient", color: "#000", color2: "#fff", angle: 90 })).toBe("linear-gradient(90deg, #000, #fff)");
  });
  it("only lets plain hex colours through", () => {
    expect(safeColor("#F5C518", "#000")).toBe("#F5C518");
    expect(safeColor("red; background:url(x)", "#000")).toBe("#000");
    expect(safeColor(5, "#000")).toBe("#000");
  });
});

describe("sanitizeDoc", () => {
  it("accepts a good design", () => {
    const result = sanitizeDoc({ ...emptyDoc(800, 1000), elements: [makeText(page, "Hello")] });
    expect("doc" in result && result.doc.elements).toHaveLength(1);
  });
  it("rejects a silly page size", () => {
    expect("error" in sanitizeDoc({ ...emptyDoc(800, 1000), width: 10 })).toBe(true);
    expect("error" in sanitizeDoc({ ...emptyDoc(800, 1000), height: 99999 })).toBe(true);
    expect("error" in sanitizeDoc(null)).toBe(true);
  });
  it("drops images that aren't embedded or https, and unknown element types", () => {
    const good = { id: "g", type: "image", x: 0, y: 0, w: 10, h: 10, src: "data:image/png;base64,AAAA" };
    const web = { ...good, id: "w", src: "https://example.com/a.png" };
    const bad = { ...good, id: "b", src: "javascript:alert(1)" };
    const svg = { ...good, id: "s", src: "data:image/svg+xml;base64,AAAA" };
    const weird = { id: "x", type: "script", x: 0, y: 0, w: 1, h: 1 };
    const result = sanitizeDoc({ ...emptyDoc(800, 1000), elements: [good, web, bad, svg, weird] });
    expect("doc" in result && result.doc.elements.map((e) => e.id)).toEqual(["g", "w"]);
  });
  it("cleans colours, fonts and numbers", () => {
    const el = { ...makeText(page, "x"), fill: "url(evil)", fontFamily: "comic", fontSize: 99999, opacity: 7 };
    const result = sanitizeDoc({ ...emptyDoc(800, 1000), elements: [el] });
    expect("doc" in result).toBe(true);
    if ("doc" in result) {
      const out = result.doc.elements[0];
      expect(out.fill).toBe("#111111");
      expect(out.fontFamily).toBe("sans");
      expect(out.fontSize).toBe(600);
      expect(out.opacity).toBe(1);
    }
  });
  it("refuses too many elements", () => {
    const many = Array.from({ length: 201 }, () => makeShape("rect", page));
    expect("error" in sanitizeDoc({ ...emptyDoc(800, 1000), elements: many })).toBe(true);
  });
});

describe("templates", () => {
  it("every template builds a valid design at every size", () => {
    for (const t of TEMPLATES) {
      for (const [w, h] of [[794, 1123], [1080, 1080], [1600, 900]]) {
        const doc = buildTemplate(t.key, w, h, "Grace Church");
        expect("doc" in sanitizeDoc(doc)).toBe(true);
        expect(new Set(doc.elements.map((e) => e.id)).size).toBe(doc.elements.length);
      }
    }
  });
  it("falls back to blank for an unknown key", () => {
    expect(buildTemplate("nope", 800, 1000, "").elements).toHaveLength(0);
  });
});

describe("icons and fonts", () => {
  it("keeps known icons and drops unknown ones", () => {
    const good = makeIcon(page, "star");
    const bad = { ...good, id: "bad", icon: "not-an-icon" };
    const result = sanitizeDoc({ ...emptyDoc(800, 1000), elements: [good, bad] });
    expect("doc" in result && result.doc.elements.map((e) => e.icon)).toEqual(["star"]);
  });
  it("accepts every Google font and builds one stylesheet address", () => {
    const el = makeText(page, "x", { fontFamily: "bebas" });
    const result = sanitizeDoc({ ...emptyDoc(800, 1000), elements: [el] });
    expect("doc" in result && result.doc.elements[0].fontFamily).toBe("bebas");
    const url = googleFontsUrl();
    expect(url).toContain("family=Playfair+Display:wght@400;700;900");
    expect(url).toContain("family=Bebas+Neue:wght@400");
    expect(url.endsWith("&display=swap")).toBe(true);
    expect(Object.keys(FONTS).length).toBeGreaterThan(10);
  });
});

describe("align and distribute", () => {
  const box = (id: string, x: number, y: number, w = 100, h = 50) => ({ ...makeShape("rect", page), id, x, y, w, h });
  it("lines one element up with the page", () => {
    const out = alignElements([box("a", 10, 10)], ["a"], "center", page);
    expect(out[0].x).toBe(350);
    expect(alignElements([box("a", 10, 10)], ["a"], "bottom", page)[0].y).toBe(950);
  });
  it("lines several up with each other", () => {
    const els = [box("a", 10, 10), box("b", 300, 200), box("c", 50, 90)];
    expect(alignElements(els, ["a", "b", "c"], "left", page).map((e) => e.x)).toEqual([10, 10, 10]);
    expect(alignElements(els, ["a", "b"], "right", page).map((e) => e.x)).toEqual([300, 300, 50]);
  });
  it("leaves locked elements where they are", () => {
    const els = [{ ...box("a", 10, 10), locked: true }, box("b", 300, 200)];
    expect(alignElements(els, ["a", "b"], "left", page).map((e) => e.x)).toEqual([10, 10]);
  });
  it("spaces three or more evenly, and ignores fewer", () => {
    const els = [box("a", 0, 0), box("b", 120, 0), box("c", 400, 0)];
    expect(distributeElements(els, ["a", "b", "c"], "horizontal").map((e) => e.x)).toEqual([0, 200, 400]);
    expect(distributeElements(els, ["a", "b"], "horizontal")).toBe(els);
  });
});
