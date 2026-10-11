import { describe, it, expect } from "vitest";
import { featureTag, featureTesterEmails, isFeatureUnavailable, nextNewUntil } from "./feature-status";

const NOW = new Date("2026-10-11T00:00:00Z");

describe("isFeatureUnavailable", () => {
  it("off blocks everyone, testing blocks everyone but test users, beta and live block no one", () => {
    expect(isFeatureUnavailable("off", "geoken199915@gmail.com")).toBe(true);
    expect(isFeatureUnavailable("testing", "someone@church.org")).toBe(true);
    expect(isFeatureUnavailable("testing", null)).toBe(true);
    expect(isFeatureUnavailable("testing", "GeoKen199915@Gmail.com")).toBe(false);
    expect(isFeatureUnavailable("beta", "someone@church.org")).toBe(false);
    expect(isFeatureUnavailable("live", "someone@church.org")).toBe(false);
  });

  it("test users can be set with FEATURE_TESTER_EMAILS", () => {
    expect(featureTesterEmails("a@x.org, B@x.org")).toEqual(["a@x.org", "b@x.org"]);
    expect(featureTesterEmails("")).toEqual(["geoken199915@gmail.com"]);
  });
});

describe("featureTag", () => {
  it("tags testing and beta, and live only while the New period lasts", () => {
    expect(featureTag("testing", null, NOW)).toBe("testing");
    expect(featureTag("beta", null, NOW)).toBe("beta");
    expect(featureTag("live", "2026-10-20T00:00:00Z", NOW)).toBe("new");
    expect(featureTag("live", "2026-10-01T00:00:00Z", NOW)).toBeNull();
    expect(featureTag("live", null, NOW)).toBeNull();
    expect(featureTag("off", null, NOW)).toBeNull();
  });
});

describe("nextNewUntil", () => {
  it("starts a 15-day New period only when moving from beta to live", () => {
    expect(nextNewUntil("beta", "live", null, NOW)).toBe("2026-10-26T00:00:00.000Z");
    expect(nextNewUntil("testing", "live", null, NOW)).toBeNull();
    expect(nextNewUntil("off", "live", null, NOW)).toBeNull();
  });

  it("keeps the period when re-saving live and clears it when leaving live", () => {
    expect(nextNewUntil("live", "live", "2026-10-20T00:00:00Z", NOW)).toBe("2026-10-20T00:00:00Z");
    expect(nextNewUntil("live", "beta", "2026-10-20T00:00:00Z", NOW)).toBeNull();
  });
});
