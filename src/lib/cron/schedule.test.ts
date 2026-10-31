import { describe, it, expect } from "vitest";
import { parseDailySchedule, parseIntervalMinutes, lastExpectedRun, describeSchedule } from "./schedule";

describe("parseDailySchedule", () => {
  it("reads a daily expression", () => {
    expect(parseDailySchedule("0 1 * * *")).toEqual({ minute: 0, hour: 1 });
  });
  it("returns null for shapes it doesn't understand", () => {
    expect(parseDailySchedule("*/5 * * * *")).toBeNull();
    expect(parseIntervalMinutes("*/7 * * * *")).toBeNull();
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

describe("every-N-minutes schedules", () => {
  it("reads and describes them", () => {
    expect(parseIntervalMinutes("*/15 * * * *")).toBe(15);
    expect(describeSchedule("*/15 * * * *")).toBe("Every 15 minutes");
  });
  it("expects the slot before the latest one, to allow for a late start", () => {
    expect(lastExpectedRun("*/15 * * * *", new Date("2026-10-10T03:42:00Z"))?.toISOString()).toBe("2026-10-10T03:15:00.000Z");
  });
});
