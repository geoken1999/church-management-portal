import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The projector page in a real browser. It is the live site's page for a church's projector (the secret address is
// E2E_PROJECTOR_TOKEN); what it is told to show is replaced with test data, so nothing about the church's real screen is
// read or changed.
const token = process.env.E2E_PROJECTOR_TOKEN;

type State = { visible: boolean; mode: "full" | "lower_third"; slide: Record<string, string> | null; theme: Record<string, string>; updatedAt: string };

const verse = { kind: "bible", title: "John 3:16", text: "For God so loved the world, that he gave his only begotten Son.", footer: "KJV" };
// A one-pixel picture, so the test needs no network.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

async function serve(page: Page, state: () => State) {
  await page.route("**/api/projector/*", (route) => route.fulfill({ json: { ok: true, ...state() }, headers: { "Cache-Control": "no-store" } }));
}

test.describe("projector", () => {
  test.skip(!token, "Set E2E_PROJECTOR_TOKEN to run the projector tests.");

  test("shows a Bible verse full screen, and blanks when hidden", async ({ page }) => {
    let state: State = { visible: true, mode: "full", slide: verse, theme: {}, updatedAt: "1" };
    await serve(page, () => state);
    await page.goto(`/projector/${token}`);
    await expect(page.getByText("For God so loved the world")).toBeVisible();
    await expect(page.getByText("John 3:16")).toBeVisible();
    await expect(page.getByText("KJV")).toBeVisible();
    // Solid dark background, text large enough to read from the back of a hall.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
    const size = await page.getByText("For God so loved the world").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThan(30);
    await page.waitForTimeout(700); // let the fade-in finish
    await page.screenshot({ path: path.join(__dirname, "artifacts/projector-full.png") });

    // The church blanks the screen: the verse disappears within a couple of polls.
    state = { ...state, visible: false, updatedAt: "2" };
    await expect(page.getByText("For God so loved the world")).toHaveCount(0, { timeout: 8000 });
  });

  test("switches slides when the operator shows another", async ({ page }) => {
    let state: State = { visible: true, mode: "full", slide: verse, theme: {}, updatedAt: "1" };
    await serve(page, () => state);
    await page.goto(`/projector/${token}`);
    await expect(page.getByText("John 3:16")).toBeVisible();
    state = { visible: true, mode: "full", slide: { kind: "song", title: "Amazing Grace", text: "Amazing grace! How sweet the sound", footer: "1 / 3" }, theme: {}, updatedAt: "2" };
    await expect(page.getByText("Amazing grace! How sweet the sound")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("John 3:16")).toHaveCount(0);
  });

  test("lower third mode is a bar along the bottom with no page background", async ({ page }) => {
    const state: State = { visible: true, mode: "lower_third", slide: verse, theme: {}, updatedAt: "1" };
    await serve(page, () => state);
    await page.goto(`/projector/${token}`);
    const text = page.getByText("For God so loved the world");
    await expect(text).toBeVisible();
    // Over video: nothing behind the bar.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    const box = await text.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeGreaterThan(viewport.height * 0.6);
    await page.waitForTimeout(700);
    // Put a video-like picture behind the page, as OBS would have, to see the bar over it.
    await page.evaluate(() => (document.documentElement.style.background = "linear-gradient(135deg,#2b6cb0,#e6a23c)"));
    await page.screenshot({ path: path.join(__dirname, "artifacts/projector-lower-third.png") });
  });

  test("a PowerPoint slide picture fills the screen even in lower third mode", async ({ page }) => {
    const state: State = { visible: true, mode: "lower_third", slide: { kind: "presentation", title: "Songs", text: "Slide 3", footer: "3 / 8", image: PIXEL }, theme: {}, updatedAt: "1" };
    await serve(page, () => state);
    await page.goto(`/projector/${token}`);
    const image = page.locator("img[alt='Slide 3']");
    await expect(image).toBeVisible();
    const box = await image.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeCloseTo(viewport.width, -1);
    expect(box!.height).toBeCloseTo(viewport.height, -1);
  });

  test("?bg=transparent removes the page background for OBS", async ({ page }) => {
    const state: State = { visible: true, mode: "full", slide: verse, theme: {}, updatedAt: "1" };
    await serve(page, () => state);
    await page.goto(`/projector/${token}?bg=transparent`);
    await expect(page.getByText("For God so loved the world")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  });

  test("the church's colours and font are applied, and anything unsafe is ignored by the server's cleaning", async ({ page }) => {
    const state: State = { visible: true, mode: "full", slide: verse, theme: { background: "#102a5c", color: "#ffd966", font: "serif" }, updatedAt: "1" };
    await serve(page, () => state);
    await page.goto(`/projector/${token}`);
    const text = page.getByText("For God so loved the world");
    await expect(text).toBeVisible();
    expect(await text.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 217, 102)");
    expect(await text.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Georgia");
  });

  test("keeps showing the last slide through a short connection drop", async ({ page }) => {
    let fail = false;
    await page.route("**/api/projector/*", (route) => (fail ? route.abort() : route.fulfill({ json: { ok: true, visible: true, mode: "full", slide: verse, theme: {}, updatedAt: "1" } })));
    await page.goto(`/projector/${token}`);
    await expect(page.getByText("For God so loved the world")).toBeVisible();
    fail = true;
    await page.waitForTimeout(3500);
    await expect(page.getByText("For God so loved the world")).toBeVisible();
  });
});
