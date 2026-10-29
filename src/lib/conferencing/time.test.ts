import { describe, expect, it } from "vitest";
import { zonedToIso } from "./time";

describe("zonedToIso", () => {
  it("reads the time in the church's zone", () => {
    expect(zonedToIso("2026-11-02T18:30", "Asia/Kolkata")).toBe("2026-11-02T13:00:00.000Z");
    expect(zonedToIso("2026-07-01T09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToIso("2026-11-02T18:30", "UTC")).toBe("2026-11-02T18:30:00.000Z");
  });
  it("falls back to UTC for a zone it doesn't know", () => {
    expect(zonedToIso("2026-11-02T18:30", "Nowhere/Land")).toBe("2026-11-02T18:30:00.000Z");
  });
});
