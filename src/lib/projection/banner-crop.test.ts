import { describe, expect, it } from "vitest";
import { BANNER_ASPECT, cropRect, maxCropWidth, outputSize } from "@/lib/projection/banner-crop";

describe("banner crop", () => {
  it("is 22% of a 16:9 screen's height, full width", () => {
    expect(1920 / BANNER_ASPECT).toBeCloseTo(1080 * 0.22, 5);
  });
  it("uses the full width of a tall picture and the full height of an already-wide one", () => {
    expect(maxCropWidth(1000, 1000)).toBe(1000);
    expect(maxCropWidth(4000, 100)).toBeCloseTo(100 * BANNER_ASPECT, 5);
  });
  it("keeps the rectangle inside the picture", () => {
    const r = cropRect(1000, 1000, 0.5, 900, 990);
    expect(r.x + r.w).toBeLessThanOrEqual(1000);
    expect(r.y + r.h).toBeLessThanOrEqual(1000);
    expect(r.w / r.h).toBeCloseTo(BANNER_ASPECT, 5);
    expect(cropRect(1000, 1000, 1, -50, -50)).toMatchObject({ x: 0, y: 0 });
  });
  it("saves at most 1920 wide and never enlarges", () => {
    expect(outputSize({ x: 0, y: 0, w: 4000, h: 485 })).toEqual({ width: 1920, height: 238 });
    expect(outputSize({ x: 0, y: 0, w: 800, h: 99 })).toEqual({ width: 800, height: 99 });
  });
});
