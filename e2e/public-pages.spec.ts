import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page shows the app, Bible School and the iPhone badge", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/KingdomFlow/i);
    await expect(page.getByText("Google Play").first()).toBeVisible();
    await expect(
      page.getByLabel("App Store, coming soon").first(),
    ).toBeVisible();
    await expect(page.getByText("Bible School").first()).toBeVisible();
    await expect(
      page.getByText("Birthday & anniversary alerts").first(),
    ).toBeVisible();
  });

  test("privacy policy lists the security practices and voice prayers", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Data security" }),
    ).toBeVisible();
    await expect(page.getByText("AES-256-GCM").first()).toBeVisible();
    await expect(page.getByText("Voice prayer requests").first()).toBeVisible();
    await expect(page.getByText("secure storage").first()).toBeVisible();
  });

  test("terms and the account deletion form open", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await page.goto("/delete-account");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("sign-in page asks for email and password", async ({
    page,
  }, testInfo) => {
    // Phones are sent to the app instead of the web sign-in, on purpose.
    test.skip(
      testInfo.project.name === "phone",
      "the team sign-in is closed to phones",
    );
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password").first()).toBeVisible();
  });
});

test.describe("certificates", () => {
  test("a code nobody holds says so on the check page", async ({ page }) => {
    await page.goto("/verify/certificate/AAAAAAAAAAAA");
    await expect(page.getByRole("heading", { name: "Certificate not found" })).toBeVisible();
  });

  test("the certificate PDF answers 404 as JSON for an unknown or malformed code", async ({ request }) => {
    for (const code of ["AAAAAAAAAAAA", "not-a-code"]) {
      const response = await request.get(`/api/certificate/${code}`);
      expect(response.status(), code).toBe(404);
      expect((await response.json()).error).toBeTruthy();
    }
  });
});

test.describe("Bible School public pages", () => {
  test("an unknown church has no Bible School page", async ({ request }) => {
    const response = await request.get("/bible-school/no-such-church-e2e");
    expect(response.status()).toBe(404);
  });

  test("an invalid payment link says so instead of failing", async ({
    page,
  }) => {
    await page.goto("/bible-school/checkout/not-a-real-order");
    await expect(page.getByText(/isn.t valid any more/i)).toBeVisible();
  });
});
