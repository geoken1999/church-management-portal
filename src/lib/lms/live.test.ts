import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "@/lib/organizations/timezone";
import {
  attendanceSummary,
  canJoinNow,
  durationMinutes,
  durationProblem,
  endsAt,
  reminderDue,
  toLocalInput,
  validateSession,
} from "@/lib/lms/live";

const IST = "Asia/Kolkata";
const now = new Date("2026-10-17T10:00:00Z");
const input = {
  title: "Week 1: Genesis",
  description: "",
  startsAtLocal: "2026-10-20T18:30",
  durationMinutes: "60",
  mode: "video",
};

describe("validateSession", () => {
  it("accepts a good class", () => {
    expect(validateSession(input, now, IST, { requireFuture: true })).toEqual(
      {},
    );
  });
  it("rejects a short title, a bad kind and a bad length", () => {
    const errors = validateSession(
      { ...input, title: "ab", mode: "hologram", durationMinutes: "5" },
      now,
      IST,
      { requireFuture: true },
    );
    expect(errors.title).toBeTruthy();
    expect(errors.mode).toBeTruthy();
    expect(errors.durationMinutes).toBeTruthy();
    expect(
      validateSession({ ...input, durationMinutes: "600" }, now, IST, {
        requireFuture: true,
      }).durationMinutes,
    ).toBeTruthy();
    expect(
      validateSession({ ...input, durationMinutes: "45.5" }, now, IST, {
        requireFuture: true,
      }).durationMinutes,
    ).toBeTruthy();
  });
  it("needs a date, and a future one when scheduling", () => {
    expect(
      validateSession({ ...input, startsAtLocal: "" }, now, IST, {
        requireFuture: true,
      }).startsAtLocal,
    ).toBeTruthy();
    expect(
      validateSession(
        { ...input, startsAtLocal: "2026-10-01T10:00" },
        now,
        IST,
        { requireFuture: true },
      ).startsAtLocal,
    ).toMatch(/future/);
    expect(
      validateSession(
        { ...input, startsAtLocal: "2026-10-01T10:00" },
        now,
        IST,
        { requireFuture: false },
      ).startsAtLocal,
    ).toBeUndefined();
  });
});

describe("plan call limit", () => {
  it("refuses a class the plan would cut off", () => {
    expect(durationProblem(60, 20)).toMatch(/20 minutes/);
    expect(durationProblem(20, 20)).toBeNull();
    expect(durationProblem(480, null)).toBeNull();
  });
});

describe("class times", () => {
  it("works out the end and the length", () => {
    const start = new Date("2026-10-20T13:00:00Z");
    expect(endsAt(start, 90).toISOString()).toBe("2026-10-20T14:30:00.000Z");
    expect(
      durationMinutes(start.toISOString(), "2026-10-20T14:30:00.000Z"),
    ).toBe(90);
  });
  it("shows a time in the church's zone and reads it back the same", () => {
    const utc = zonedTimeToUtc("2026-10-20T18:30", IST);
    expect(utc.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(toLocalInput(utc.toISOString(), IST)).toBe("2026-10-20T18:30");
    expect(toLocalInput("2026-10-20T00:15:00.000Z", "Asia/Kolkata")).toBe(
      "2026-10-20T05:45",
    );
  });
});

describe("joining and reminders", () => {
  const session = {
    starts_at: "2026-10-17T10:30:00Z",
    ends_at: "2026-10-17T11:30:00Z",
    status: "scheduled",
    meeting_id: "m1",
    reminder_sent_at: null,
  };

  it("opens 15 minutes before the start and closes at the end", () => {
    expect(canJoinNow(new Date("2026-10-17T10:14:00Z"), session)).toBe(false);
    expect(canJoinNow(new Date("2026-10-17T10:16:00Z"), session)).toBe(true);
    expect(canJoinNow(new Date("2026-10-17T11:30:00Z"), session)).toBe(true);
    expect(canJoinNow(new Date("2026-10-17T11:31:00Z"), session)).toBe(false);
  });
  it("is closed for a cancelled class or one with no room", () => {
    expect(
      canJoinNow(new Date("2026-10-17T10:30:00Z"), {
        ...session,
        status: "cancelled",
      }),
    ).toBe(false);
    expect(
      canJoinNow(new Date("2026-10-17T10:30:00Z"), {
        ...session,
        meeting_id: null,
      }),
    ).toBe(false);
  });
  it("sends one reminder within 10 minutes of the start", () => {
    expect(reminderDue(new Date("2026-10-17T10:19:00Z"), session)).toBe(false);
    expect(reminderDue(new Date("2026-10-17T10:21:00Z"), session)).toBe(true);
    expect(reminderDue(new Date("2026-10-17T10:33:00Z"), session)).toBe(true);
    expect(reminderDue(new Date("2026-10-17T10:40:00Z"), session)).toBe(false);
    expect(
      reminderDue(new Date("2026-10-17T10:25:00Z"), {
        ...session,
        reminder_sent_at: "2026-10-17T10:22:00Z",
      }),
    ).toBe(false);
    expect(
      reminderDue(new Date("2026-10-17T10:25:00Z"), {
        ...session,
        status: "cancelled",
      }),
    ).toBe(false);
  });
});

describe("attendanceSummary", () => {
  it("counts each kind and those not marked", () => {
    expect(
      attendanceSummary([
        "present",
        "present",
        "absent",
        "excused",
        null,
        null,
        null,
      ]),
    ).toEqual({ present: 2, absent: 1, excused: 1, unmarked: 3 });
  });
});
