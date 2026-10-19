import { expect, test } from "@playwright/test";

test.describe("web student portal sign-in", () => {
  test("a signed-out visitor sees the phone sign-in", async ({ page }) => {
    await page.goto("/bible-school/learn");
    await expect(
      page.getByRole("heading", { name: "Sign in to your courses" }),
    ).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeVisible();
  });

  test("the code button waits for a real-looking number", async ({ page }) => {
    await page.goto("/bible-school/learn");
    const send = page.getByRole("button", { name: "Send code" });
    await expect(send).toBeDisabled();
    await page.getByLabel("Mobile number").fill("12345");
    await expect(send).toBeDisabled();
    await page.getByLabel("Mobile number").fill("9000000000");
    await expect(send).toBeEnabled();
  });

  test("a number the church does not know is told so and no code is sent", async ({
    page,
  }) => {
    await page.goto("/bible-school/learn");
    await page.getByLabel("Mobile number").fill("0000000000");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByText(
        /No member account was found|more than one church|couldn.t be checked/i,
      ),
    ).toBeVisible();
    // Still on the first step: the code field never appeared.
    await expect(page.getByLabel("Code")).toHaveCount(0);
  });

  test("the portal is not offered to search engines", async ({ page }) => {
    await page.goto("/bible-school/learn");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
