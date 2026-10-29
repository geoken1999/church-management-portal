// Browser-only helpers for pictures that go into a design.

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That picture couldn't be opened."));
    image.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number): { canvas: HTMLCanvasElement; w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process pictures.");
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, w, h };
}

export interface ReadImage {
  /** The picture, shrunk to at most 1600 pixels on its longest side, as a data URL. */
  src: string;
  w: number;
  h: number;
  /** A small JPEG (at most 512 pixels) for showing the AI what the picture looks like. */
  preview: string;
}

// Reads a picture, shrinks it so the saved design stays light, and returns it as an embedded data URL.
export async function readImage(file: File): Promise<ReadImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { canvas, w, h } = drawScaled(img, 1600);
    // Keep transparency for PNGs unless that makes the picture too heavy.
    let src = file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
    if (src.length > 2_000_000) src = canvas.toDataURL("image/jpeg", 0.8);
    const small = drawScaled(img, 512).canvas;
    // A flat white background so a transparent PNG doesn't turn black as a JPEG.
    const flat = document.createElement("canvas");
    flat.width = small.width;
    flat.height = small.height;
    const flatCtx = flat.getContext("2d");
    if (flatCtx) {
      flatCtx.fillStyle = "#ffffff";
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(small, 0, 0);
    }
    return { src, w, h, preview: flat.toDataURL("image/jpeg", 0.7) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
