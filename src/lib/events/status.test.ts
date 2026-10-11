import { describe, it, expect } from "vitest";
import { effectiveEventStatus, hasEventEnded } from "./status";

const TZ = "Asia/Kolkata";
const base = { end_at: null, is_recurring: false, recurrence_end_date: null, status: "active" as const };

describe("hasEventEnded", () => {
  it("a one-off event with an end time is over after it", () => {
    const event = { ...base, start_at: "2026-11-21T03:30:00Z", end_at: "2026-11-21T10:30:00Z" };
    expect(hasEventEnded(event, new Date("2026-11-21T10:00:00Z"), TZ)).toBe(false);
    expect(hasEventEnded(event, new Date("2026-11-21T10:31:00Z"), TZ)).toBe(true);
  });

  it("without an end time it is over once its day (in the church's timezone) has passed", () => {
    const event = { ...base, start_at: "2026-11-21T03:30:00Z" }; // 9:00 AM IST, 21 Nov
    expect(hasEventEnded(event, new Date("2026-11-21T18:00:00Z"), TZ)).toBe(false); // 11:30 PM IST, still 21 Nov
    expect(hasEventEnded(event, new Date("2026-11-21T18:31:00Z"), TZ)).toBe(true); // just past midnight IST, 22 Nov
  });

  it("a recurring event only ends after its recurrence end date", () => {
    const open = { ...base, start_at: "2026-01-04T04:30:00Z", is_recurring: true };
    expect(hasEventEnded(open, new Date("2030-01-01T00:00:00Z"), TZ)).toBe(false);
    const limited = { ...open, recurrence_end_date: "2026-12-31" };
    expect(hasEventEnded(limited, new Date("2026-12-31T10:00:00Z"), TZ)).toBe(false);
    expect(hasEventEnded(limited, new Date("2027-01-01T10:00:00Z"), TZ)).toBe(true);
  });
});

describe("effectiveEventStatus", () => {
  const past = { ...base, start_at: "2026-01-01T04:30:00Z" };

  it("moves a past active or pending event to completed", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(effectiveEventStatus(past, now, TZ)).toBe("completed");
    expect(effectiveEventStatus({ ...past, status: "pending" }, now, TZ)).toBe("completed");
  });

  it("keeps cancelled events cancelled even when their date has passed", () => {
    expect(effectiveEventStatus({ ...past, status: "cancelled" }, new Date("2026-06-01T00:00:00Z"), TZ)).toBe("cancelled");
  });

  it("leaves an upcoming event as it is", () => {
    expect(effectiveEventStatus({ ...base, start_at: "2026-12-01T04:30:00Z" }, new Date("2026-06-01T00:00:00Z"), TZ)).toBe("active");
  });
});
