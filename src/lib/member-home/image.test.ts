import { describe, it, expect } from "vitest";
import { readJpegSize } from "./image";

// SOI, then a SOF0 segment for a 1200x600 image.
const jpeg = (w: number, h: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00]);

describe("readJpegSize", () => {
  it("reads width and height from the frame header", () => {
    expect(readJpegSize(jpeg(1200, 600))).toEqual({ width: 1200, height: 600 });
  });
  it("rejects non-JPEG data", () => {
    expect(readJpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
    expect(readJpegSize(new Uint8Array([]))).toBeNull();
  });
});
