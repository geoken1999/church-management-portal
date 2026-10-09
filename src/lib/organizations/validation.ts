import type { MemberCountRange } from "@/types/database";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function validateOrganizationName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Organization name is required.";
  if (trimmed.length < 2) return "Organization name must be at least 2 characters.";
  if (trimmed.length > 80) return "Organization name must be under 80 characters.";
  return undefined;
}

export const MEMBER_COUNT_OPTIONS: { value: MemberCountRange; label: string }[] = [
  { value: "1-50", label: "1–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-500", label: "201–500" },
  { value: "501-1000", label: "501–1,000" },
  { value: "1000+", label: "1,000+" },
];

export const CHURCH_ROLE_OPTIONS = [
  "Senior Pastor",
  "Associate / Assistant Pastor",
  "Church Administrator",
  "Ministry / Department Leader",
  "Volunteer",
  "Other",
] as const;

export function isMemberCountRange(value: string): value is MemberCountRange {
  return MEMBER_COUNT_OPTIONS.some((o) => o.value === value);
}

export function validateBranchCount(value: string): string | undefined {
  if (!value.trim()) return "Enter the number of locations.";
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return "Enter a whole number of 1 or more.";
  }
  if (parsed > 100000) {
    return "That number looks too high — double-check it.";
  }
  return undefined;
}

export const MAX_LOGO_BYTES = 10 * 1024 * 1024;
// SVG deliberately excluded: it's rendered directly as an <img> on every
// public-facing page (PublicBrandHeader) with no sanitization, and a
// pathologically complex SVG (deeply nested <use>/<pattern> references, an
// enormous viewBox) can make the browser hang or crash while trying to
// rasterize it — a decompression-bomb-style failure mode raster formats
// don't have. Raster logos cover the real need here.
export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
// A generous backstop, not the primary defense — LogoCropDialog is the
// real answer to "this image is bigger than the 512x512 target" now (the
// admin crops it down themselves), and decoding happens off the main
// thread (createImageBitmap, see ChurchLogoUpload), so there's no longer
// a performance reason to reject a merely-large photo. This only exists
// to stop a truly degenerate file (a multi-gigapixel image) from being
// decoded at all — any real camera or phone photo, even high-resolution
// ones, stays well under this.
export const MAX_LOGO_DIMENSION_PX = 20000;
