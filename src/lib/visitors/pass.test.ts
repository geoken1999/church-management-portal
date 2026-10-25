import { describe, expect, it } from "vitest";
import { generatePassCode, passState, passValidUntil } from "@/lib/visitors/pass";

describe("generatePassCode", () => {
  it("is six unambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(generatePassCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
  it("follows the random source", () => {
    expect(generatePassCode(() => 0)).toBe("AAAAAA");
  });
});

describe("passValidUntil", () => {
  it("is the end of the visit day in the church's own time", () => {
    expect(passValidUntil("2026-11-01", "Asia/Kolkata").toISOString()).toBe("2026-11-01T18:29:00.000Z");
    expect(passValidUntil("2026-11-01", "UTC").toISOString()).toBe("2026-11-01T23:59:00.000Z");
  });
});

describe("passState", () => {
  const until = "2026-11-01T18:29:00.000Z";
  it("is valid before the end of the day", () => expect(passState({ valid_until: until, entered_at: null }, new Date("2026-11-01T10:00:00Z"))).toBe("valid"));
  it("is expired after it", () => expect(passState({ valid_until: until, entered_at: null }, new Date("2026-11-01T19:00:00Z"))).toBe("expired"));
  it("is used up once entered", () => expect(passState({ valid_until: until, entered_at: "2026-11-01T05:00:00Z" }, new Date("2026-11-01T06:00:00Z"))).toBe("entered"));
});
