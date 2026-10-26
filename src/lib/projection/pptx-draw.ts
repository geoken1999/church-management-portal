import { extractSlideTexts } from "@/lib/projection/pptx-text";

// Draws each slide of a .pptx in the browser and turns it into a JPEG picture. Done in the browser, not on the server,
// because the browser already has the fonts the deck was written with and nothing has to be installed anywhere. Browser only.

export interface Drawn {
  blob: Blob;
  /** An address the picture can be shown at (a data address). */
  url: string;
  /** The words found on the slide. */
  text: string;
  width: number;
  height: number;
}

export const SLIDE_WIDTH = 1280;
export const JPEG_QUALITY = 0.85;

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 60)));

export async function drawPresentation(buffer: ArrayBuffer, onProgress: (done: number, total: number) => void = () => {}): Promise<Drawn[]> {
  const [{ init }, { toJpeg }, texts] = await Promise.all([import("pptx-preview"), import("html-to-image"), extractSlideTexts(buffer.slice(0)).catch(() => [] as string[])]);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SLIDE_WIDTH}px;height:720px;pointer-events:none;overflow:hidden`;
  document.body.appendChild(host);
  try {
    const previewer = init(host, { width: SLIDE_WIDTH, height: 720, mode: "slide" });
    // The drawing library gives up on a file whose parts are laid out unusually, sometimes by finding no slides at all.
    try {
      await previewer.preview(buffer);
    } catch {
      throw new Error("This presentation could not be drawn.");
    }
    const total = previewer.slideCount;
    if (total === 0) throw new Error("This presentation could not be drawn.");
    const drawn: Drawn[] = [];
    for (let i = 0; i < total; i++) {
      onProgress(i, total);
      previewer.renderSingleSlide(i);
      await frame();
      const element = host.querySelector<HTMLElement>(".pptx-preview-slide-wrapper");
      if (!element) throw new Error("A slide could not be drawn.");
      const width = element.offsetWidth || SLIDE_WIDTH;
      const height = element.offsetHeight || 720;
      const url = await toJpeg(element, {
        quality: JPEG_QUALITY,
        pixelRatio: 1,
        width,
        height,
        backgroundColor: "#ffffff",
        // The previewer places a slide with its own offsets; the picture must start at the slide's corner.
        style: { position: "relative", top: "0", left: "0", margin: "0", transform: "none" },
      });
      drawn.push({ blob: await (await fetch(url)).blob(), url, text: texts[i] ?? "", width, height });
    }
    onProgress(total, total);
    return drawn;
  } finally {
    host.remove();
  }
}
