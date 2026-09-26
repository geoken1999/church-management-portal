// Reads pixel width/height straight out of an image file's own header
// bytes — no image-processing library (sharp, etc.) is installed in this
// project, and pulling one in as a native dependency just to read two
// integers out of a header would be a lot of weight for what's otherwise a
// few well-documented byte offsets. Only the three types
// ALLOWED_PASS_BACKGROUND_TYPES actually allows are implemented.
export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (isPng(buffer)) return readPngDimensions(buffer);
  if (isJpeg(buffer)) return readJpegDimensions(buffer);
  if (isWebp(buffer)) return readWebpDimensions(buffer);
  return null;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  // IHDR is always the first chunk: 8-byte signature, 4-byte length,
  // 4-byte "IHDR" type, then 4-byte width + 4-byte height, both big-endian.
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

// JPEG stores dimensions in whichever "start of frame" segment appears —
// walk the marker segments until one of those is found.
function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];

    // Standalone markers with no length/payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG (reserved)
      marker !== 0xcc; // DAC

    if (isSof) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    offset += 2 + segmentLength;
  }
  return null;
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 16 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  const fourCc = buffer.subarray(12, 16).toString("ascii");

  if (fourCc === "VP8X") {
    // 1 byte flags + 3 bytes reserved, then 24-bit little-endian
    // width-minus-1 and height-minus-1.
    const width = (buffer.readUIntLE(24, 3) & 0xffffff) + 1;
    const height = (buffer.readUIntLE(27, 3) & 0xffffff) + 1;
    return { width, height };
  }

  if (fourCc === "VP8L") {
    // Byte 0 is a 0x2f signature; the next 4 bytes (little-endian) pack
    // 14-bit width-minus-1 then 14-bit height-minus-1.
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (fourCc === "VP8 ") {
    // 3-byte frame tag, then a 3-byte start code (0x9d 0x01 0x2a), then
    // 14-bit width + 2-bit horizontal scale, then 14-bit height + 2-bit
    // vertical scale, both little-endian 16-bit.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  return null;
}
