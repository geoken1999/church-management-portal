import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./recurrence";

const IST = "Asia/Kolkata";

describe("nextOccurrence", () => {
  it("moves a daily message to the next day at the same local time", () => {
    const from = new Date("2026-11-01T03:30:00Z"); // 09:00 IST
    expect(nextOccurrence(from, "daily", IST, new Date("2026-11-01T03:31:00Z")).toISOString()).toBe("2026-11-02T03:30:00.000Z");
  });

  it("moves a weekly message by seven days", () => {
    const from = new Date("2026-11-01T03:30:00Z");
    expect(nextOccurrence(from, "weekly", IST, from).toISOString()).toBe("2026-11-08T03:30:00.000Z");
  });

  it("skips times that were missed instead of sending them all", () => {
    const from = new Date("2026-11-01T03:30:00Z");
    expect(nextOccurrence(from, "daily", IST, new Date("2026-11-05T10:00:00Z")).toISOString()).toBe("2026-11-06T03:30:00.000Z");
  });

  it("keeps the day of the month, using the last day of short months", () => {
    const jan31 = new Date("2027-01-31T03:30:00Z");
    const feb = nextOccurrence(jan31, "monthly", IST, jan31, 31);
    expect(feb.toISOString()).toBe("2027-02-28T03:30:00.000Z");
    expect(nextOccurrence(feb, "monthly", IST, feb, 31).toISOString()).toBe("2027-03-31T03:30:00.000Z");
  });

  it("keeps the wall-clock time across a daylight-saving change", () => {
    const tz = "America/New_York";
    const before = new Date("2026-11-01T13:00:00Z"); // 08:00 EDT, the morning clocks go back
    const next = nextOccurrence(before, "daily", tz, before);
    expect(next.toISOString()).toBe("2026-11-02T13:00:00.000Z"); // 08:00 EST
  });
});
