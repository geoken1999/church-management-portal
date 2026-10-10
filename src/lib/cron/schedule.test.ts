import { describe, it, expect } from "vitest";
import { parseDailySchedule, lastExpectedRun, describeSchedule } from "./schedule";

describe("parseDailySchedule", () => {
  it("reads a daily expression", () => {
    expect(parseDailySchedule("0 1 * * *")).toEqual({ minute: 0, hour: 1 });
  });
  it("returns null for shapes it doesn't understand", () => {
    expect(parseDailySchedule("*/5 * * * *")).toBeNull();
    expect(parseDailySchedule("0 25 * * *")).toBeNull();
  });
});

describe("lastExpectedRun", () => {
  it("is today's slot once it has passed", () => {
    expect(lastExpectedRun("0 1 * * *", new Date("2026-10-10T03:42:00Z"))?.toISOString()).toBe("2026-10-10T01:00:00.000Z");
  });
  it("is yesterday's slot before today's has arrived", () => {
    expect(lastExpectedRun("0 1 * * *", new Date("2026-10-10T00:30:00Z"))?.toISOString()).toBe("2026-10-09T01:00:00.000Z");
  });
});

describe("describeSchedule", () => {
  it("shows IST and UTC", () => {
    expect(describeSchedule("0 1 * * *")).toBe("Daily at 06:30 IST (01:00 UTC)");
  });
});
