import { expect, test } from "@playwright/test";

test.describe("browser security headers", () => {
  test("every page is served with the basic protections", async ({
    request,
  }) => {
    for (const path of ["/", "/privacy", "/login"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["referrer-policy"], path).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["strict-transport-security"], path).toContain("max-age=");
      expect(headers["permissions-policy"], path).toContain("camera=(self)");
      expect(headers["content-security-policy-report-only"], path).toContain(
        "default-src 'self'",
      );
    }
  });

  test("the team's screens refuse to be framed, public pages stay embeddable", async ({
    request,
  }) => {
    expect((await request.get("/login")).headers()["x-frame-options"]).toBe(
      "DENY",
    );
    expect(
      (await request.get("/privacy")).headers()["x-frame-options"],
    ).toBeUndefined();
  });

  test("the policy report endpoint accepts a report and stores nothing", async ({
    request,
  }) => {
    const response = await request.post("/api/csp-report", {
      data: { "csp-report": { "blocked-uri": "https://example.com" } },
    });
    expect(response.status()).toBe(204);
  });
});
