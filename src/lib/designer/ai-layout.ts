import { FONTS, newId, sanitizeDoc, safeColor, type DesignBackground, type DesignDoc, type DesignElement, type FontKey } from "./model";
import { ICON_KEYS, type IconKey } from "./icons";

// Turns what the AI sends back into a design. The AI only chooses WHAT goes on the page (an ordered list of blocks,
// a colour scheme and a few decorations). This code decides WHERE: it sizes and spaces the blocks so nothing
// overlaps or runs off the page, and it fixes text that would be hard to read. Asking a language model for pixel
// coordinates gives crowded, overlapping pages; asking it for content and style does not.

/** A one-pixel picture standing in for a photo until the browser puts the real one in. */
export const PLACEHOLDER_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export const MAX_AI_BLOCKS = 14;

export interface ImageSlot {
  elementId: string;
  /** "image1", "image2", … or "logo" */
  ref: string;
}

export interface AiLayout {
  name: string;
  doc: DesignDoc;
  slots: ImageSlot[];
}

export interface AiImageRef {
  ref: string;
  width: number;
  height: number;
}

type Size = "xl" | "l" | "m" | "s";

const TEXT_SCALE: Record<Size, number> = { xl: 0.115, l: 0.075, m: 0.048, s: 0.034 };
const ICON_SCALE: Record<Size, number> = { xl: 0.2, l: 0.15, m: 0.1, s: 0.065 };
const IMAGE_SCALE: Record<Size, number> = { xl: 1, l: 0.9, m: 0.6, s: 0.35 };

function size(value: unknown, fallback: Size): Size {
  return value === "xl" || value === "l" || value === "m" || value === "s" ? value : fallback;
}

// --- colour ------------------------------------------------------------------------------------------------------

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Keeps the AI's text colour when it can be read on the background, otherwise uses white or near-black. */
export function readableColor(color: string, backgrounds: string[], minimum = 3.2): string {
  const worst = (c: string) => Math.min(...backgrounds.map((bg) => contrastRatio(c, bg)));
  if (worst(color) >= minimum) return color;
  return worst("#ffffff") >= worst("#111111") ? "#ffffff" : "#111111";
}

// --- text measuring ----------------------------------------------------------------------------------------------

const NARROW_FONTS: FontKey[] = ["bebas", "anton", "oswald"];

/** A rough height for a block of text, so its box is about right before the editor measures it. */
export function estimateTextHeight(text: string, fontSize: number, width: number, lineHeight: number, letterSpacing = 0, charFactor = 0.55): number {
  const charWidth = fontSize * charFactor + letterSpacing;
  const perLine = Math.max(1, Math.floor(width / Math.max(1, charWidth)));
  const lines = text.split("\n").reduce((sum, paragraph) => {
    // Wrap on words, the way the browser does, rather than just dividing the length.
    let count = 1;
    let used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (used === 0) used = len;
      else if (used + 1 + len <= perLine) used += 1 + len;
      else {
        count += 1;
        used = len;
      }
      while (used > perLine) {
        count += 1;
        used -= perLine;
      }
    }
    return sum + count;
  }, 0);
  return Math.max(8, Math.round(lines * fontSize * lineHeight));
}

function charFactorFor(fontFamily: FontKey, weight: number, uppercase: boolean): number {
  let factor = NARROW_FONTS.includes(fontFamily) ? 0.45 : 0.52;
  if (weight >= 700) factor += 0.05;
  if (uppercase) factor += 0.08;
  return factor;
}

// --- layout ------------------------------------------------------------------------------------------------------

interface Block {
  kind: "text" | "image" | "icon" | "divider";
  /** Height at scale 1; recomputed when the page has to shrink the content. */
  make: (scale: number) => { h: number; build: (y: number) => DesignElement | null };
  gapAfter: number;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function buildDocFromAi(raw: string, width: number, height: number, images: AiImageRef[]): AiLayout | { error: string } {
  const unreadable = { error: "The designer sent back something we couldn't read. Please try again." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unreadable;
  }
  if (!parsed || typeof parsed !== "object") return unreadable;
  const data = parsed as Record<string, unknown>;
  const rawBlocks = Array.isArray(data.blocks) ? data.blocks.slice(0, MAX_AI_BLOCKS) : [];

  const base = Math.min(width, height); // type and pictures are sized from the shorter side
  const bgRaw = (data.background ?? {}) as Record<string, unknown>;
  const bgColor = safeColor(bgRaw.color, "#ffffff");
  const background: DesignBackground = {
    type: bgRaw.type === "gradient" ? "gradient" : "solid",
    color: bgColor,
    color2: safeColor(bgRaw.color2, bgColor),
    angle: num(bgRaw.angle, 160),
  };
  const bgColors = background.type === "gradient" ? [background.color, background.color2 ?? background.color] : [background.color];
  const align: "left" | "center" = data.align === "left" ? "left" : "center";

  // --- decorations, behind everything -------------------------------------------------------------------
  const decorations: DesignElement[] = [];
  let topInset = 0;
  let bottomInset = 0;
  let framed = false;
  const accents = Array.isArray(data.accents) ? data.accents.slice(0, 5) : [];
  for (const item of accents) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const color = safeColor(a.color, "#F5C518");
    const opacity = Math.min(1, Math.max(0.05, num(a.opacity, 0.3)));
    const common = { rotation: 0, opacity };
    switch (a.kind) {
      case "frame": {
        if (framed) break;
        framed = true;
        const inset = Math.round(base * 0.035);
        decorations.push({ id: newId(), type: "rect", x: inset, y: inset, w: width - inset * 2, h: height - inset * 2, fill: "#00000000", stroke: color, strokeWidth: Math.max(2, Math.round(base * 0.006)), radius: 0, rotation: 0, opacity: Math.max(opacity, 0.6) });
        break;
      }
      case "band_top": {
        const h = Math.round(height * 0.07);
        topInset = Math.max(topInset, h);
        decorations.push({ id: newId(), type: "rect", x: 0, y: 0, w: width, h, fill: color, stroke: color, strokeWidth: 0, radius: 0, rotation: 0, opacity: Math.max(opacity, 0.9) });
        break;
      }
      case "band_bottom": {
        const h = Math.round(height * 0.07);
        bottomInset = Math.max(bottomInset, h);
        decorations.push({ id: newId(), type: "rect", x: 0, y: height - h, w: width, h, fill: color, stroke: color, strokeWidth: 0, radius: 0, rotation: 0, opacity: Math.max(opacity, 0.9) });
        break;
      }
      case "circle_top_right": {
        const d = Math.round(base * 0.7);
        decorations.push({ ...common, id: newId(), type: "ellipse", x: Math.round(width - d * 0.6), y: Math.round(-d * 0.4), w: d, h: d, fill: color, stroke: color, strokeWidth: 0 });
        break;
      }
      case "circle_bottom_left": {
        const d = Math.round(base * 0.7);
        decorations.push({ ...common, id: newId(), type: "ellipse", x: Math.round(-d * 0.4), y: Math.round(height - d * 0.6), w: d, h: d, fill: color, stroke: color, strokeWidth: 0 });
        break;
      }
      case "corner_icons": {
        const icon = typeof a.icon === "string" && (ICON_KEYS as string[]).includes(a.icon) ? (a.icon as IconKey) : "star";
        const s = Math.round(base * 0.07);
        const m = Math.round(base * 0.07);
        decorations.push({ ...common, id: newId(), type: "icon", icon, x: m, y: m + topInset, w: s, h: s, fill: color });
        decorations.push({ ...common, id: newId(), type: "icon", icon, x: width - m - s, y: height - m - s - bottomInset, w: s, h: s, fill: color });
        break;
      }
    }
  }

  const margin = Math.round(base * (framed ? 0.1 : 0.08));
  const marginX = Math.round(width * (framed ? 0.1 : 0.08));
  const contentW = width - marginX * 2;
  const top = margin + topInset;
  const bottom = height - margin - bottomInset;
  const slots: ImageSlot[] = [];

  // --- content blocks -----------------------------------------------------------------------------------
  const blocks: Block[] = [];
  for (const item of rawBlocks) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    if (b.type === "text") {
      const value = text(b.text, 600).trim();
      if (!value) continue;
      const sz = size(b.size, "m");
      const family: FontKey = typeof b.fontFamily === "string" && b.fontFamily in FONTS ? (b.fontFamily as FontKey) : "sans";
      const weight: 400 | 700 | 900 = b.fontWeight === 700 || b.fontWeight === 900 ? b.fontWeight : 400;
      const uppercase = b.uppercase === true;
      const letterSpacing = Math.min(20, Math.max(0, num(b.letterSpacing, 0)));
      const lineHeight = sz === "xl" || sz === "l" ? 1.1 : 1.3;
      const color = readableColor(safeColor(b.color, "#111111"), bgColors);
      blocks.push({
        kind: "text",
        gapAfter: sz === "xl" ? 0.045 : sz === "l" ? 0.035 : 0.022,
        make: (scale) => {
          let fontSize = Math.max(10, Math.round(base * TEXT_SCALE[sz] * scale));
          // A single long word must still fit across the page.
          const longest = Math.max(...value.split(/\s+/).map((w) => w.length));
          const factor = charFactorFor(family, weight, uppercase);
          while (fontSize > 10 && longest * (fontSize * factor + letterSpacing) > contentW) fontSize -= 2;
          const h = estimateTextHeight(value, fontSize, contentW, lineHeight, letterSpacing, factor);
          return {
            h,
            build: (y) => ({
              id: newId(),
              type: "text",
              x: marginX,
              y,
              w: contentW,
              h,
              rotation: 0,
              opacity: 1,
              text: value,
              fontFamily: family,
              fontSize,
              fontWeight: weight,
              italic: b.italic === true,
              uppercase,
              align,
              lineHeight,
              letterSpacing,
              fill: color,
            }),
          };
        },
      });
    } else if (b.type === "image") {
      const ref = typeof b.image === "string" ? b.image : "";
      const meta = images.find((i) => i.ref === ref);
      if (!meta) continue; // only pictures the person attached (or their logo)
      const sz = size(b.size, "l");
      const shape = b.shape === "circle" || b.shape === "rounded" ? b.shape : "rect";
      const isLogo = ref === "logo";
      blocks.push({
        kind: "image",
        gapAfter: 0.03,
        make: (scale) => {
          const aspect = shape === "circle" || isLogo ? 1 : Math.min(2.2, Math.max(0.5, meta.width / meta.height));
          let w = Math.round((isLogo ? base * 0.18 : contentW * IMAGE_SCALE[sz]) * scale);
          let h = Math.round(w / aspect);
          const maxH = Math.round((bottom - top) * (isLogo ? 0.14 : 0.46) * scale);
          if (h > maxH) {
            h = maxH;
            w = Math.round(h * aspect);
          }
          if (shape === "circle") {
            const d = Math.min(w, h);
            w = d;
            h = d;
          }
          return {
            h,
            build: (y) => {
              const id = newId();
              slots.push({ elementId: id, ref });
              return {
                id,
                type: "image",
                x: align === "left" ? marginX : Math.round((width - w) / 2),
                y,
                w,
                h,
                rotation: 0,
                opacity: 1,
                src: PLACEHOLDER_IMAGE,
                fit: isLogo ? "contain" : "cover",
                radius: shape === "circle" ? 2000 : shape === "rounded" ? Math.round(base * 0.03) : 0,
              };
            },
          };
        },
      });
    } else if (b.type === "icon") {
      if (typeof b.icon !== "string" || !(ICON_KEYS as string[]).includes(b.icon)) continue;
      const icon = b.icon as IconKey;
      const sz = size(b.size, "m");
      const color = safeColor(b.color, "#F5C518");
      blocks.push({
        kind: "icon",
        gapAfter: 0.025,
        make: (scale) => {
          const s = Math.round(base * ICON_SCALE[sz] * scale);
          return {
            h: s,
            build: (y) => ({ id: newId(), type: "icon", icon, x: align === "left" ? marginX : Math.round((width - s) / 2), y, w: s, h: s, rotation: 0, opacity: 1, fill: color }),
          };
        },
      });
    } else if (b.type === "divider") {
      const color = safeColor(b.color, "#F5C518");
      blocks.push({
        kind: "divider",
        gapAfter: 0.03,
        make: (scale) => {
          const h = Math.max(3, Math.round(base * 0.008 * scale));
          const w = Math.round(contentW * 0.25);
          return {
            h,
            build: (y) => ({ id: newId(), type: "rect", x: align === "left" ? marginX : Math.round((width - w) / 2), y, w, h, rotation: 0, opacity: 1, fill: color, stroke: color, strokeWidth: 0, radius: 0 }),
          };
        },
      });
    }
  }
  if (blocks.length === 0) return { error: "The designer didn't produce anything usable. Try describing the flyer in a little more detail." };

  // Shrink everything together until the stack fits between the margins.
  const available = bottom - top;
  let scale = 1;
  let made = blocks.map((b) => b.make(scale));
  const gapsTotal = () => blocks.slice(0, -1).reduce((sum, b) => sum + Math.round(base * b.gapAfter * scale), 0);
  const stackHeight = () => made.reduce((sum, m) => sum + m.h, 0) + gapsTotal();
  for (let i = 0; i < 12 && stackHeight() > available; i++) {
    scale *= 0.92;
    made = blocks.map((b) => b.make(scale));
  }

  // Spread any spare room between the blocks (up to a point) and centre the whole stack vertically.
  const free = Math.max(0, available - stackHeight());
  const gapCount = Math.max(1, blocks.length - 1);
  const stretch = Math.min(free / gapCount, base * 0.05);
  const stackTotal = stackHeight() + stretch * (blocks.length - 1);
  let y = Math.round(top + Math.max(0, (available - stackTotal) / 2));
  const content: DesignElement[] = [];
  made.forEach((m, i) => {
    const el = m.build(y);
    if (el) content.push(el);
    y += m.h + Math.round(base * blocks[i].gapAfter * scale) + Math.round(stretch);
  });

  const checked = sanitizeDoc({ width, height, background, elements: [...decorations, ...content] });
  if ("error" in checked) return { error: checked.error };
  const kept = new Set(checked.doc.elements.map((el) => el.id));
  const name = text(data.name, 80).trim() || "AI design";
  return { name, doc: checked.doc, slots: slots.filter((s) => kept.has(s.elementId)) };
}
