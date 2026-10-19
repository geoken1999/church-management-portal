import { expect, test } from "@playwright/test";

const PRIVATE_PAGES = [
  "/dashboard",
  "/dashboard/bible-school",
  "/dashboard/prayer",
  "/dashboard/payouts",
  "/platform-admin",
  "/onboarding",
];

test.describe("private pages turn visitors away", () => {
  for (const path of PRIVATE_PAGES) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe("mobile and payment endpoints need a session", () => {
  const requireSession: [string, string][] = [
    ["POST", "/api/mobile/prayer-requests"],
    [
      "GET",
      "/api/mobile/prayer-requests/audio?id=00000000-0000-0000-0000-000000000000",
    ],
    [
      "DELETE",
      "/api/mobile/prayer-requests/audio?id=00000000-0000-0000-0000-000000000000",
    ],
    ["POST", "/api/mobile/prayer-requests/audio-upload"],
    ["POST", "/api/mobile/bible-school/checkout"],
    [
      "GET",
      "/api/mobile/lms/lesson-file?lessonId=00000000-0000-0000-0000-000000000000",
    ],
    ["POST", "/api/mobile/call"],
  ];
  for (const [method, path] of requireSession) {
    test(`${method} ${path.split("?")[0]} answers 401 as JSON`, async ({
      request,
    }) => {
      const response = await request.fetch(path, { method });
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.ok).toBe(false);
    });
  }

  test("scheduled jobs refuse a caller without the secret", async ({
    request,
  }) => {
    for (const job of ["special-days", "todo-reminders"]) {
      const response = await request.get(`/api/cron/${job}`);
      expect(response.status(), job).toBe(401);
    }
  });

  test("the payment return page never errors on junk", async ({ request }) => {
    const response = await request.post(
      "/api/payu/bible-school/return?orderId=junk",
      {
        form: { status: "success", txnid: "x", hash: "bad" },
        maxRedirects: 0,
      },
    );
    expect(response.status()).toBe(303);
  });
});
