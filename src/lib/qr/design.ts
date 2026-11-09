import QRCode from "qrcode";

import { qrLogoRatio } from "@/lib/qr/logo-size";

// A QR code drawn as SVG from its module matrix, so the look (colours, dot and corner shapes, logo, label) is ours
// and the same SVG serves the preview, the PNG and the vector download. Works in the browser and on the server.

export const DOT_STYLES = ["square", "rounded", "dots"] as const;
export const EYE_STYLES = ["square", "rounded", "circle"] as const;
export const LOGO_SHAPES = ["square", "rounded", "circle"] as const;

export interface QrDesign {
  /** Colour of the dots, and of the start of the gradient. */
  fg: string;
  /** End colour of a gradient across the dots, or null for a solid colour. */
  fg2: string | null;
  bg: string;
  transparent: boolean;
  dots: (typeof DOT_STYLES)[number];
  eyes: (typeof EYE_STYLES)[number];
  /** The three corner squares, or null to use the dot colour. */
  eyeColor: string | null;
  /** Put the church's logo in the middle. */
  logo: boolean;
  logoShape: (typeof LOGO_SHAPES)[number];
  /** A solid patch in the background colour behind the logo; off lets a transparent logo sit straight on the code. */
  logoBacking: boolean;
  /** Text on a bar under the code, e.g. "Scan to give". */
  label: string;
  labelBar: string;
  labelText: string;
}

export const DEFAULT_QR_DESIGN: QrDesign = {
  fg: "#111827",
  fg2: null,
  bg: "#ffffff",
  transparent: false,
  dots: "square",
  eyes: "square",
  eyeColor: null,
  logo: false,
  logoShape: "square",
  logoBacking: true,
  label: "",
  labelBar: "#111827",
  labelText: "#ffffff",
};

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** A design read back from the database or a form: anything missing or invalid falls back to the default. */
export function normalizeDesign(raw: unknown): QrDesign {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = DEFAULT_QR_DESIGN;
  return {
    fg: color(d.fg, base.fg),
    fg2: d.fg2 ? color(d.fg2, base.fg) : null,
    bg: color(d.bg, base.bg),
    transparent: d.transparent === true,
    dots: oneOf(d.dots, DOT_STYLES, base.dots),
    eyes: oneOf(d.eyes, EYE_STYLES, base.eyes),
    eyeColor: d.eyeColor ? color(d.eyeColor, base.fg) : null,
    logo: d.logo === true,
    logoShape: oneOf(d.logoShape, LOGO_SHAPES, base.logoShape),
    logoBacking: d.logoBacking !== false,
    label: typeof d.label === "string" ? d.label.slice(0, 30) : "",
    labelBar: color(d.labelBar, base.labelBar),
    labelText: color(d.labelText, base.labelText),
  };
}

/** WCAG contrast ratio of two #rrggbb colours; scanners need roughly 3 or more, with the dots darker than the background. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const f = (n: number) => Number(n.toFixed(3));

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${f(x + rr)} ${f(y)}h${f(w - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}v${f(h - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${-f(rr)} ${f(rr)}h${-f(w - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${-f(rr)} ${-f(rr)}v${-f(h - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${-f(rr)}z`;
}

const EYE_RADIUS = { square: [0, 0, 0], rounded: [1.9, 1.1, 0.9], circle: [3.5, 2.5, 1.5] } as const;

function eyePath(x: number, y: number, style: QrDesign["eyes"]): string {
  const [outer, inner, pupil] = EYE_RADIUS[style];
  // Ring (outer 7x7 minus inner 5x5, filled even-odd) and the 3x3 pupil.
  return roundedRect(x, y, 7, 7, outer) + roundedRect(x + 1, y + 1, 5, 5, inner) + roundedRect(x + 2, y + 2, 3, 3, pupil);
}

export interface RenderOptions {
  /** Pixel width of the whole image. */
  size?: number;
  /** The logo as a data: URL (so a downloaded SVG stands alone). Only used when the design asks for a logo. */
  logoDataUrl?: string | null;
  logoSizePercent?: number;
}

const QUIET = 2;

export function renderQrSvg(text: string, design: QrDesign, options: RenderOptions = {}): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const get = (r: number, c: number) => qr.modules.get(r, c) === 1;
  const logo = design.logo && options.logoDataUrl ? options.logoDataUrl : null;
  const logoSize = logo ? Math.round(n * qrLogoRatio(options.logoSizePercent)) : 0;
  const logoFrom = Math.floor((n - logoSize) / 2) - 1;
  const logoTo = logoFrom + logoSize + 2;
  const inLogo = (r: number, c: number) => Boolean(logo) && r >= logoFrom && r <= logoTo && c >= logoFrom && c <= logoTo;
  const inEye = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const width = n + QUIET * 2;
  const labelHeight = design.label.trim() ? 5 : 0;
  const height = width + labelHeight;
  const pixelWidth = options.size ?? 512;
  const pixelHeight = Math.round((pixelWidth * height) / width);

  let dots = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!get(r, c) || inEye(r, c) || inLogo(r, c)) continue;
      const x = c + QUIET;
      const y = r + QUIET;
      if (design.dots === "dots") dots += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.46"/>`;
      else if (design.dots === "rounded") dots += `<rect x="${x}" y="${y}" width="1.02" height="1.02" rx="0.32"/>`;
      else dots += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    }
  }

  const eyeFill = design.eyeColor ?? null;
  const eyes = [
    [QUIET, QUIET],
    [QUIET + n - 7, QUIET],
    [QUIET, QUIET + n - 7],
  ]
    .map(([x, y]) => eyePath(x, y, design.eyes))
    .join("");

  // Ids inside inline SVGs are page-wide, so they must differ whenever the drawing differs: the card and the open editor
  // show the same code, and a shared clip-path id would make the editor keep drawing the card's logo shape.
  const gid = `g${Array.from(text + JSON.stringify(design) + logoSize).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)}`;
  const gradient = design.fg2
    ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${design.fg}"/><stop offset="1" stop-color="${design.fg2}"/></linearGradient></defs>`
    : "";
  const dotFill = design.fg2 ? `url(#${gid})` : design.fg;

  const logoX = QUIET + (n - logoSize) / 2;
  const cx = logoX + logoSize / 2;
  const clipId = `${gid}c`;
  const shapeAt = (pad: number, attrs: string) => {
    const size = logoSize + pad * 2;
    const at = logoX - pad;
    if (design.logoShape === "circle") return `<circle cx="${f(cx)}" cy="${f(cx)}" r="${f(size / 2)}" ${attrs}/>`;
    const rx = design.logoShape === "rounded" ? f(size * 0.22) : 0;
    return `<rect x="${f(at)}" y="${f(at)}" width="${f(size)}" height="${f(size)}" rx="${rx}" ${attrs}/>`;
  };
  const logoMarkup = logo
    ? (design.logoBacking ? shapeAt(0.4, `fill="${design.transparent ? "#ffffff" : design.bg}"`) : "") +
      `<clipPath id="${clipId}">${shapeAt(0, "")}</clipPath>` +
      `<image href="${logo}" x="${f(logoX)}" y="${f(logoX)}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`
    : "";

  const label = labelHeight
    ? `<rect x="${QUIET}" y="${width - 0.4}" width="${n}" height="3.4" rx="1.1" fill="${design.labelBar}"/>` +
      `<text x="${width / 2}" y="${width + 1.62}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="1.9" fill="${design.labelText}">${escapeXml(design.label.trim())}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}" shape-rendering="geometricPrecision">` +
    gradient +
    (design.transparent ? "" : `<rect width="${width}" height="${height}" fill="${design.bg}"/>`) +
    `<g fill="${dotFill}">${dots}</g>` +
    `<path d="${eyes}" fill="${eyeFill ?? dotFill}" fill-rule="evenodd"/>` +
    logoMarkup +
    label +
    `</svg>`
  );
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
