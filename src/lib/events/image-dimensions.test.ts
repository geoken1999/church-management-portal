import { describe, it, expect } from "vitest";
import { getImageDimensions } from "@/lib/events/image-dimensions";

function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0); // signature
  buf.writeUInt32BE(13, 8); // IHDR chunk length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpegBuffer(width: number, height: number): Buffer {
  const parts: number[] = [0xff, 0xd8]; // SOI
  // A harmless APP0 segment (length 4 = just the length field, no payload)
  // to exercise the marker-skipping loop before the real SOF segment.
  parts.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);
  // SOF0: marker, length(8), precision(1), height(2), width(2), components(1)
  parts.push(0xff, 0xc0, 0x00, 0x08, 0x08);
  const buf = Buffer.from(parts);
  const sof = Buffer.alloc(5);
  sof.writeUInt16BE(height, 0);
  sof.writeUInt16BE(width, 2);
  sof.writeUInt8(0, 4);
  return Buffer.concat([buf, sof]);
}

function webpVp8xBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt8(0, 20); // flags
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

describe("getImageDimensions", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    expect(getImageDimensions(pngBuffer(1200, 350))).toEqual({ width: 1200, height: 350 });
  });

  it("reads JPEG width/height from the SOF0 segment", () => {
    expect(getImageDimensions(jpegBuffer(1200, 350))).toEqual({ width: 1200, height: 350 });
  });

  it("reads WebP (VP8X) width/height", () => {
    expect(getImageDimensions(webpVp8xBuffer(1200, 350))).toEqual({ width: 1200, height: 350 });
  });

  it("returns null for an unrecognized format", () => {
    expect(getImageDimensions(Buffer.from("not an image"))).toBeNull();
  });
});
