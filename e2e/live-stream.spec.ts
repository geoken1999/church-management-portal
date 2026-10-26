import { expect, test } from "@playwright/test";

// Live stream and verse projection: the public side, read only. Nothing is submitted. (The dashboard side needs a signed-in
// church, so it is not here; see the README.)
test.describe("live stream: public routes", () => {
  test("a projector address that isn't a projector is a 404", async ({ page }) => {
    const response = await page.goto("/projector/00000000-0000-0000-0000-000000000000");
    expect(response?.status()).toBe(404);
  });

  test("the projector state API refuses a made-up token", async ({ request }) => {
    expect((await request.get("/api/projector/not-a-token")).status()).toBe(404);
  });

  test("a visitor pass link that isn't a pass says so", async ({ page }) => {
    await page.goto("/visitor-pass/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Pass not found")).toBeVisible();
  });

  test("the OBS connection address only accepts a stream key", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    expect((await request.fetch(`/api/whip/${id}`, { method: "OPTIONS" })).status()).toBe(204);
    expect((await request.post(`/api/whip/${id}`, { data: "v=0", headers: { "Content-Type": "application/sdp" } })).status()).toBe(401);
    expect((await request.delete(`/api/whip/${id}/session`)).status()).toBe(401);
  });

  test("the live stream pages ask for a login", async ({ page }) => {
    for (const url of ["/dashboard/livestream", "/dashboard/livestream/projection"]) {
      await page.goto(url);
      await expect(page).toHaveURL(/login/);
    }
  });

  test("the member app's live stream route needs a session", async ({ request }) => {
    expect((await request.get("/api/mobile/live-stream")).status()).toBe(401);
  });
});
