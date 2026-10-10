import QRCode from "qrcode";

import { qrLogoRatio } from "@/lib/qr/logo-size";

// The logo is drawn straight over the middle of the code, with no backing,
// so the QR is generated with the highest error correction (H, ~30% of the
// code can be unreadable). The size is the church's choice, capped at 30%
// of the width (about 9% of the area), well inside what H recovers.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The logo lives on Supabase's public storage, which allows cross-origin
    // reads; without this the canvas would be tainted and unexportable.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't load the QR logo."));
    image.src = src;
  });
}

// Browser only. Falls back to a plain QR if the logo can't be loaded, so a
// missing or blocked image never stops someone getting their code.
export async function renderQrDataUrl(text: string, options: { width: number; logoUrl?: string | null; logoSizePercent?: number }): Promise<string> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, { width: options.width, margin: 2, errorCorrectionLevel: "H" });

  if (options.logoUrl) {
    try {
      const logo = await loadImage(options.logoUrl);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const size = Math.round(canvas.width * qrLogoRatio(options.logoSizePercent));
        const x = Math.round((canvas.width - size) / 2);
        const y = Math.round((canvas.height - size) / 2);
        ctx.drawImage(logo, x, y, size, size);
      }
    } catch {
      // Plain QR.
    }
  }

  return canvas.toDataURL("image/png");
}
