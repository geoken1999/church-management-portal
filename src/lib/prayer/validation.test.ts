import { describe, it, expect } from "vitest";
import { parsePrayerRequestInput, prayerNotificationBody, prayerWallNotice, MAX_PRAYER_LENGTH } from "./validation";

describe("parsePrayerRequestInput", () => {
  it("accepts a normal request and trims it", () => {
    expect(parsePrayerRequestInput({ request: "  Please pray for my mother  ", visibility: "private" }).input).toEqual({
      request: "Please pray for my mother",
      visibility: "private",
      isAnonymous: false,
    });
  });

  it("rejects empty, too short and too long requests", () => {
    expect(parsePrayerRequestInput({ request: "  " }).error).toBeDefined();
    expect(parsePrayerRequestInput({ request: "hi" }).error).toBeDefined();
    expect(parsePrayerRequestInput({ request: "x".repeat(MAX_PRAYER_LENGTH + 1) }).error).toBeDefined();
    expect(parsePrayerRequestInput(null).error).toBeDefined();
  });

  it("defaults to private, and only a shared request can be anonymous", () => {
    expect(parsePrayerRequestInput({ request: "Pray for me", isAnonymous: true }).input).toMatchObject({ visibility: "private", isAnonymous: false });
    expect(parsePrayerRequestInput({ request: "Pray for me", visibility: "shared", isAnonymous: true }).input).toMatchObject({ visibility: "shared", isAnonymous: true });
    expect(parsePrayerRequestInput({ request: "Pray for me", visibility: "weird" }).input).toMatchObject({ visibility: "private" });
  });
});

describe("prayerNotificationBody", () => {
  it("names the member and never includes the request text", () => {
    expect(prayerNotificationBody("Ann Lee", "private")).toBe("Ann Lee shared a prayer request with the church team.");
    expect(prayerNotificationBody("Ann Lee", "shared")).toContain("with the church.");
  });
});

describe("prayerWallNotice", () => {
  it("names the person unless they are anonymous", () => {
    expect(prayerWallNotice("Asha", false).body).toContain("Asha");
    expect(prayerWallNotice("Asha", true).body).not.toContain("Asha");
    expect(prayerWallNotice("", false).body).toBe("Someone shared a prayer request. Join in prayer.");
  });
});
