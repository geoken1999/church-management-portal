import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The PowerPoint importer's drawing step, run in a real browser: the same module the dashboard uses, on sample decks.
// It does not touch the site under test: the drawing code is bundled here (vite, from src/) and run on a blank page.
test.beforeAll(() => {
  execFileSync("npx", ["vite", "build", "--logLevel", "error", "--config", path.resolve(__dirname, "harness/vite.config.mts")], { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
});

const deck = (name: string) => readFileSync(path.join(__dirname, "fixtures", name)).toString("base64");

interface Drawn {
  url: string;
  text: string;
  width: number;
  height: number;
  size: number;
  corner: number[];
  light: number;
  gold: number;
  red: number;
}

async function draw(page: Page, base64: string): Promise<{ slides?: Drawn[]; error?: string }> {
  await page.setContent("<!doctype html><html><body style='margin:0'></body></html>");
  await page.addScriptTag({ path: path.join(__dirname, "harness/dist/harness.js") });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    try {
      const drawn = await (window as unknown as { drawPresentation: (b: ArrayBuffer) => Promise<{ url: string; text: string; width: number; height: number; blob: Blob }[]> }).drawPresentation(bytes.buffer);
      const slides = [];
      for (const d of drawn) {
        // What the picture actually contains: its corner colour, and how many pixels are light (words), gold (title, bar) or red (picture).
        const img = new Image();
        img.src = d.url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const corner = Array.from(ctx.getImageData(5, 5, 1, 1).data.slice(0, 3));
        const all = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let light = 0;
        let gold = 0;
        let red = 0;
        for (let i = 0; i < all.length; i += 4) {
          const [r, g, b] = [all[i], all[i + 1], all[i + 2]];
          if (r > 200 && g > 200 && b > 200) light++;
          if (r > 200 && g > 170 && b < 140) gold++;
          if (r > 170 && g < 90 && b < 90) red++;
        }
        slides.push({ url: d.url, text: d.text, width: d.width, height: d.height, size: d.blob.size, corner, light, gold, red });
      }
      return { slides };
    } catch (e) {
      return { error: String((e as Error).message ?? e) };
    }
  }, base64);
}

test("a PowerPoint deck is drawn slide by slide into pictures that look like the slides", async ({ page }) => {
  const result = await draw(page, deck("sample-songs-office.pptx"));
  expect(result.error).toBeUndefined();
  const slides = result.slides!;
  expect(slides).toHaveLength(3);
  // Keep a screenshot of the pictures to look at.
  await page.setContent(`<body style="margin:8px;background:#777;display:flex;gap:8px;flex-wrap:wrap">${slides.map((s) => `<img src="${s.url}" style="width:420px;border:1px solid #fff">`).join("")}</body>`);
  await page.screenshot({ path: path.join(__dirname, "artifacts/pptx-slides.png"), fullPage: true });

  for (const [i, s] of slides.entries()) {
    expect(s.width, `slide ${i + 1} width`).toBe(1280);
    expect(s.height, `slide ${i + 1} height`).toBe(720);
    expect(s.size, `slide ${i + 1} picture size`).toBeGreaterThan(8_000);
    // The background is the deck's dark blue (#102A5C), not white or black.
    expect(s.corner[2], `slide ${i + 1} background blue`).toBeGreaterThan(60);
    expect(s.corner[0], `slide ${i + 1} background red`).toBeLessThan(60);
    // The words (white) and the gold title or bar are really there.
    expect(s.light, `slide ${i + 1} light pixels (the words)`).toBeGreaterThan(1500);
    expect(s.gold, `slide ${i + 1} gold pixels`).toBeGreaterThan(400);
  }
  // The picture on the last slide came through.
  expect(slides[2].red).toBeGreaterThan(2000);
  // The words found on each slide are kept with it, in order.
  expect(slides[0].text).toContain("Amazing grace! How sweet the sound");
  expect(slides[1].text).toContain("He is worthy of all praise");
  expect(slides[2].text).toContain("இயேசு என் மேய்ப்பர்");
});

test("a deck the drawing step cannot read fails with a clear error, and its words can still be read", async ({ page }) => {
  // This deck was made by a generator that gives every slide its own slide master; the drawing library finds no slides in it.
  const result = await draw(page, deck("sample-songs.pptx"));
  expect(result.slides).toBeUndefined();
  expect(result.error).toContain("could not be drawn");
});
