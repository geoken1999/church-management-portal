import QRCode from "qrcode";

// The logo covers the middle of the code, so the QR is generated with the
// highest error correction (H, ~30% of the code can be unreadable) and the
// logo is kept to about a fifth of the width, well inside what H recovers.
export const QR_LOGO_RATIO = 0.22;

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
export async function renderQrDataUrl(text: string, options: { width: number; logoUrl?: string | null }): Promise<string> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, { width: options.width, margin: 2, errorCorrectionLevel: "H" });

  if (options.logoUrl) {
    try {
      const logo = await loadImage(options.logoUrl);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const size = Math.round(canvas.width * QR_LOGO_RATIO);
        const pad = Math.round(size * 0.12);
        const x = Math.round((canvas.width - size) / 2);
        const y = Math.round((canvas.height - size) / 2);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(x - pad, y - pad, size + pad * 2, size + pad * 2, pad * 1.5);
        ctx.fill();
        ctx.drawImage(logo, x, y, size, size);
      }
    } catch {
      // Plain QR.
    }
  }

  return canvas.toDataURL("image/png");
}
