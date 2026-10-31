import { describe, expect, it } from "vitest";
import { skipsSessionCheck } from "./middleware";

describe("skipsSessionCheck", () => {
  it("skips polled, scheduled, mobile and webhook routes", () => {
    for (const path of ["/api/projector/abc", "/api/cron/event-reminders", "/api/mobile/feedback", "/api/razorpay/webhook", "/api/netcheck"]) expect(skipsSessionCheck(path)).toBe(true);
  });
  it("keeps the check on anything that reads the cookie", () => {
    for (const path of ["/dashboard", "/api/mobile/web-session", "/api/youtube/callback", "/api/instagram/connect", "/login"]) expect(skipsSessionCheck(path)).toBe(false);
  });
});
