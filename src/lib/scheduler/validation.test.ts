import { describe, expect, it } from "vitest";
import { parseScheduleTime, summarize } from "@/lib/scheduler/validation";

const now = new Date("2026-10-14T06:00:00Z"); // 11:30 in Kolkata

describe("parseScheduleTime", () => {
  it("reads the time as the church's local time", () => {
    const r = parseScheduleTime("2026-10-14T18:00", "Asia/Kolkata", now);
    expect("at" in r && r.at.toISOString()).toBe("2026-10-14T12:30:00.000Z");
  });
  it("refuses a time that is too soon, in the past, or too far away", () => {
    expect(parseScheduleTime("2026-10-14T11:32", "Asia/Kolkata", now)).toEqual({ error: "Choose a time at least 5 minutes from now." });
    expect(parseScheduleTime("2026-10-13T11:30", "Asia/Kolkata", now)).toHaveProperty("error");
    expect(parseScheduleTime("2028-01-01T09:00", "Asia/Kolkata", now)).toEqual({ error: "Choose a time within the next year." });
  });
  it("refuses something that isn't a date", () => {
    expect(parseScheduleTime("tomorrow", "Asia/Kolkata", now)).toEqual({ error: "Choose a valid date and time." });
  });
});

describe("summarize", () => {
  it("collapses spaces and trims long text", () => {
    expect(summarize("sms", "  Hello   there \n friends ")).toBe("Hello there friends");
    expect(summarize("sms", "x".repeat(300)).length).toBe(100);
  });
});
