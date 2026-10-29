// The flyer / poster designer's document model. A design is a fixed-size page with a background and a stack of
// elements (back to front). It is stored as JSON and drawn as plain absolutely-positioned HTML, so the editor, the
// thumbnails and the PNG/PDF export all render from the same data.

export type ElementType = "text" | "rect" | "ellipse" | "line" | "image";

export interface DesignElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  opacity: number;
  locked?: boolean;
  // Text
  text?: string;
  fontFamily?: FontKey;
  fontSize?: number;
  fontWeight?: 400 | 700 | 900;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  // Shapes and text colour
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  // Image
  src?: string;
  fit?: "cover" | "contain";
}

export interface DesignBackground {
  type: "solid" | "gradient";
  color: string;
  /** Second colour for a gradient. */
  color2?: string;
  angle?: number;
}

export interface DesignDoc {
  width: number;
  height: number;
  background: DesignBackground;
  elements: DesignElement[];
}

export type DesignKind = "flyer" | "poster" | "social" | "custom";

export const FONTS = {
  sans: { label: "Modern", css: "'Helvetica Neue', Arial, sans-serif" },
  serif: { label: "Classic", css: "Georgia, 'Times New Roman', serif" },
  display: { label: "Bold", css: "Impact, 'Arial Black', sans-serif" },
  script: { label: "Script", css: "'Brush Script MT', 'Segoe Script', cursive" },
  mono: { label: "Typewriter", css: "'Courier New', monospace" },
} as const;
export type FontKey = keyof typeof FONTS;

export interface SizePreset {
  key: string;
  label: string;
  kind: DesignKind;
  width: number;
  height: number;
  note: string;
}

// Pixel sizes at roughly 96 dpi for print, and the usual pixel sizes for social posts.
export const SIZE_PRESETS: SizePreset[] = [
  { key: "a4", label: "Flyer (A4)", kind: "flyer", width: 794, height: 1123, note: "Print, 21 × 29.7 cm" },
  { key: "a5", label: "Flyer (A5)", kind: "flyer", width: 559, height: 794, note: "Print, 14.8 × 21 cm" },
  { key: "poster", label: "Poster (A3)", kind: "poster", width: 1123, height: 1587, note: "Print, 29.7 × 42 cm" },
  { key: "square", label: "Social post", kind: "social", width: 1080, height: 1080, note: "Instagram / Facebook, 1080 × 1080" },
  { key: "story", label: "Story", kind: "social", width: 1080, height: 1920, note: "Instagram / WhatsApp status, 1080 × 1920" },
  { key: "banner", label: "Banner", kind: "social", width: 1600, height: 900, note: "Facebook / YouTube cover, 16:9" },
];

export const MAX_ELEMENTS = 200;
export const MIN_SIZE = 8;
export const MAX_DOC_BYTES = 6 * 1024 * 1024;
export const MAX_CANVAS_SIDE = 4000;

export function newId(): string {
  return `e${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function backgroundCss(bg: DesignBackground): string {
  if (bg.type === "gradient") return `linear-gradient(${bg.angle ?? 160}deg, ${bg.color}, ${bg.color2 ?? bg.color})`;
  return bg.color;
}

export function makeText(doc: Pick<DesignDoc, "width" | "height">, text: string, patch: Partial<DesignElement> = {}): DesignElement {
  const w = Math.round(doc.width * 0.7);
  const fontSize = patch.fontSize ?? Math.round(doc.width * 0.06);
  return {
    id: newId(),
    type: "text",
    x: Math.round((doc.width - w) / 2),
    y: Math.round(doc.height * 0.4),
    w,
    h: Math.round(fontSize * 1.4),
    rotation: 0,
    opacity: 1,
    text,
    fontFamily: "sans",
    fontSize,
    fontWeight: 400,
    align: "center",
    lineHeight: 1.2,
    fill: "#111111",
    ...patch,
  };
}

export function makeShape(type: "rect" | "ellipse" | "line", doc: Pick<DesignDoc, "width" | "height">, patch: Partial<DesignElement> = {}): DesignElement {
  const w = type === "line" ? Math.round(doc.width * 0.5) : Math.round(doc.width * 0.3);
  const h = type === "line" ? 6 : Math.round(doc.width * 0.3);
  return {
    id: newId(),
    type,
    x: Math.round((doc.width - w) / 2),
    y: Math.round((doc.height - h) / 2),
    w,
    h,
    rotation: 0,
    opacity: 1,
    fill: "#F5C518",
    stroke: "#111111",
    strokeWidth: 0,
    radius: 0,
    ...patch,
  };
}

export function makeImage(doc: Pick<DesignDoc, "width" | "height">, src: string, naturalW: number, naturalH: number): DesignElement {
  const maxW = doc.width * 0.8;
  const maxH = doc.height * 0.6;
  const scale = Math.min(maxW / naturalW, maxH / naturalH, 1) || 1;
  const w = Math.max(MIN_SIZE, Math.round(naturalW * scale));
  const h = Math.max(MIN_SIZE, Math.round(naturalH * scale));
  return {
    id: newId(),
    type: "image",
    x: Math.round((doc.width - w) / 2),
    y: Math.round((doc.height - h) / 2),
    w,
    h,
    rotation: 0,
    opacity: 1,
    src,
    fit: "cover",
    radius: 0,
  };
}

/** Moves one element up or down the stack, or to the very front or back. Returns a new list. */
export function reorder(elements: DesignElement[], id: string, move: "forward" | "backward" | "front" | "back"): DesignElement[] {
  const index = elements.findIndex((e) => e.id === id);
  if (index < 0) return elements;
  const next = elements.slice();
  const [item] = next.splice(index, 1);
  const target =
    move === "front" ? next.length : move === "back" ? 0 : move === "forward" ? Math.min(next.length, index + 1) : Math.max(0, index - 1);
  next.splice(target, 0, item);
  return next;
}

/** A copy of an element, nudged so it doesn't sit exactly on top of the original. */
export function duplicateElement(el: DesignElement): DesignElement {
  return { ...el, id: newId(), x: el.x + 20, y: el.y + 20, locked: false };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const ELEMENT_TYPES: ElementType[] = ["text", "rect", "ellipse", "line", "image"];

/**
 * Cleans a design that came from the browser (or from storage) into a safe shape, or returns an error. The server
 * runs this on every save, so a stored design never holds anything the renderer can't handle.
 */
export function sanitizeDoc(input: unknown): { doc: DesignDoc } | { error: string } {
  if (!input || typeof input !== "object") return { error: "That design couldn't be read." };
  const raw = input as Record<string, unknown>;
  const width = Math.round(finite(raw.width, 0));
  const height = Math.round(finite(raw.height, 0));
  if (width < 100 || height < 100 || width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) {
    return { error: `The page size must be between 100 and ${MAX_CANVAS_SIDE} pixels on each side.` };
  }
  const bgRaw = (raw.background ?? {}) as Record<string, unknown>;
  const background: DesignBackground = {
    type: bgRaw.type === "gradient" ? "gradient" : "solid",
    color: safeColor(bgRaw.color, "#ffffff"),
    color2: safeColor(bgRaw.color2, "#ffffff"),
    angle: clamp(finite(bgRaw.angle, 160), 0, 360),
  };
  const list = Array.isArray(raw.elements) ? raw.elements : [];
  if (list.length > MAX_ELEMENTS) return { error: `A design can have up to ${MAX_ELEMENTS} elements.` };
  const elements: DesignElement[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (!ELEMENT_TYPES.includes(e.type as ElementType)) continue;
    const type = e.type as ElementType;
    const el: DesignElement = {
      id: typeof e.id === "string" && e.id.length <= 40 ? e.id : newId(),
      type,
      x: finite(e.x, 0),
      y: finite(e.y, 0),
      w: clamp(finite(e.w, 100), 1, MAX_CANVAS_SIDE * 2),
      h: clamp(finite(e.h, 100), 1, MAX_CANVAS_SIDE * 2),
      rotation: finite(e.rotation, 0),
      opacity: clamp(finite(e.opacity, 1), 0, 1),
      locked: e.locked === true ? true : undefined,
    };
    if (type === "text") {
      el.text = typeof e.text === "string" ? e.text.slice(0, 2000) : "";
      el.fontFamily = (e.fontFamily as string) in FONTS ? (e.fontFamily as FontKey) : "sans";
      el.fontSize = clamp(finite(e.fontSize, 32), 4, 600);
      el.fontWeight = e.fontWeight === 700 || e.fontWeight === 900 ? e.fontWeight : 400;
      el.italic = e.italic === true;
      el.underline = e.underline === true;
      el.align = e.align === "left" || e.align === "right" ? e.align : "center";
      el.lineHeight = clamp(finite(e.lineHeight, 1.2), 0.6, 3);
      el.letterSpacing = clamp(finite(e.letterSpacing, 0), -10, 60);
      el.uppercase = e.uppercase === true;
      el.fill = safeColor(e.fill, "#111111");
    } else if (type === "image") {
      // Only images the browser embedded itself, or hosted over https. Never script or other schemes.
      const src = typeof e.src === "string" ? e.src : "";
      if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) && !/^https:\/\//.test(src)) continue;
      el.src = src;
      el.fit = e.fit === "contain" ? "contain" : "cover";
      el.radius = clamp(finite(e.radius, 0), 0, 2000);
    } else {
      el.fill = safeColor(e.fill, "#F5C518");
      el.stroke = safeColor(e.stroke, "#111111");
      el.strokeWidth = clamp(finite(e.strokeWidth, 0), 0, 100);
      el.radius = type === "rect" ? clamp(finite(e.radius, 0), 0, 2000) : undefined;
    }
    elements.push(el);
  }
  const doc: DesignDoc = { width, height, background, elements };
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) {
    return { error: "This design is too large to save. Use smaller or fewer images." };
  }
  return { doc };
}

/** Accepts #rgb, #rrggbb and #rrggbbaa only, so a colour can never carry anything else into a style. */
export function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback;
}

export function cleanDesignName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function normalizeKind(value: unknown): DesignKind {
  return value === "flyer" || value === "poster" || value === "social" ? value : "custom";
}

export function emptyDoc(width: number, height: number): DesignDoc {
  return { width, height, background: { type: "solid", color: "#ffffff" }, elements: [] };
}
