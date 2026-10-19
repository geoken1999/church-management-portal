import { defineConfig, devices } from "@playwright/test";

// End-to-end smoke tests of the BUILT web app. They are read-only by design: they open public pages, check
// that private ones turn people away, and submit only input that is refused before anything is saved. They
// never create, change or delete data, so they are safe to run against the project in .env.local.
//
//   npx next build && npm run e2e
//
// Set E2E_BASE_URL to test an app that is already running (for example a staging deployment) instead of
// starting one here.
const PORT = 3111;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The team dashboard and sign-in are closed to phones on purpose (they are sent to the app), so a
    // phone-sized run covers only the public pages and the student portal.
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: ["**/public-pages.spec.ts", "**/student-portal.spec.ts"],
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: false,
        timeout: 60_000,
        // A known secret so the scheduled-job routes demand it, as they do in production.
        env: { CRON_SECRET: "e2e-secret-not-for-production" },
      },
});
