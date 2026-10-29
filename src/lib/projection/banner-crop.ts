// The banner picture is shown along the bottom of the screen and is 22% of the screen's height, full width. On a 16:9
// screen that is a very wide strip, so a picture is cropped to that shape when it is added. Pure.

export const BANNER_HEIGHT_FRACTION = 0.22;
/** Width divided by height of a banner on a 16:9 screen (about 9.9 : 1). */
export const BANNER_ASPECT = 16 / 9 / BANNER_HEIGHT_FRACTION;
/** The widest the saved picture needs to be (a full HD screen). */
export const BANNER_OUTPUT_WIDTH = 1920;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The largest banner-shaped rectangle that fits in the picture. */
export function maxCropWidth(imgW: number, imgH: number): number {
  return Math.min(imgW, imgH * BANNER_ASPECT);
}

/**
 * A banner-shaped rectangle in the picture: `scale` (0.1 to 1) is how much of the largest possible one it covers, and
 * (x, y) is where its top-left corner should be, moved to stay inside the picture.
 */
export function cropRect(imgW: number, imgH: number, scale: number, x: number, y: number): CropRect {
  const w = maxCropWidth(imgW, imgH) * Math.min(1, Math.max(0.1, scale));
  const h = w / BANNER_ASPECT;
  return { w, h, x: Math.min(Math.max(0, x), Math.max(0, imgW - w)), y: Math.min(Math.max(0, y), Math.max(0, imgH - h)) };
}

/** The size the cropped picture is saved at: never bigger than a full-HD screen, never enlarged. */
export function outputSize(rect: CropRect): { width: number; height: number } {
  const width = Math.max(1, Math.min(BANNER_OUTPUT_WIDTH, Math.round(rect.w)));
  return { width, height: Math.max(1, Math.round(width / BANNER_ASPECT)) };
}
