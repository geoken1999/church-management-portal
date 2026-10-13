import { describe, expect, it } from "vitest";
import { accessEndedAt, daysSince, deletionDate, nextAction } from "./rules";

const START = new Date("2026-01-01T06:00:00Z");
const at = (days: number, hours = 0) => new Date(START.getTime() + days * 86_400_000 + hours * 3_600_000);
const state = (over: Partial<{ remindersSent: number; finalWarningSentAt: Date | null }> = {}) => ({ expiredSince: START, remindersSent: 0, finalWarningSentAt: null, ...over });

describe("nextAction", () => {
  it("sends the first reminder straight away", () => {
    expect(nextAction(state(), at(0))).toBe("reminder");
  });

  it("then waits until the next 7-day mark", () => {
    expect(nextAction(state({ remindersSent: 1 }), at(3))).toBe("wait");
    expect(nextAction(state({ remindersSent: 1 }), at(7))).toBe("reminder");
    expect(nextAction(state({ remindersSent: 2 }), at(13))).toBe("wait");
    expect(nextAction(state({ remindersSent: 2 }), at(14))).toBe("reminder");
    expect(nextAction(state({ remindersSent: 3 }), at(21))).toBe("reminder");
  });

  it("never sends a fifth reminder; the final warning takes over on day 29", () => {
    expect(nextAction(state({ remindersSent: 4 }), at(28))).toBe("wait");
    expect(nextAction(state({ remindersSent: 4 }), at(29))).toBe("final_warning");
  });

  it("does not repeat the final warning", () => {
    expect(nextAction(state({ remindersSent: 4, finalWarningSentAt: at(29) }), at(29, 12))).toBe("wait");
  });

  it("deletes only on day 30 or later, and only a day after the final warning", () => {
    const warned = state({ remindersSent: 4, finalWarningSentAt: at(29, 1) });
    expect(nextAction(warned, at(29, 20))).toBe("wait");
    expect(nextAction(warned, at(30, 0))).toBe("delete");
    expect(nextAction(warned, at(30, 2))).toBe("delete");
    // Not before day 30, whenever the warning went out.
    expect(nextAction(state({ remindersSent: 4, finalWarningSentAt: at(27) }), at(29, 12))).toBe("wait");
  });

  it("warns first if a missed run means no warning went out, rather than deleting", () => {
    expect(nextAction(state({ remindersSent: 4 }), at(35))).toBe("final_warning");
  });
});

describe("dates", () => {
  it("counts whole days and finds the deletion date", () => {
    expect(daysSince(START, at(6, 23))).toBe(6);
    expect(deletionDate(START).toISOString()).toBe("2026-01-31T06:00:00.000Z");
  });
});

describe("accessEndedAt", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  it("is null while a subscription is active", () => {
    expect(accessEndedAt(new Date("2026-01-01"), { status: "active", current_end: null, updated_at: "2026-02-01" }, now)).toBeNull();
  });
  it("is null while the free trial is still running", () => {
    expect(accessEndedAt(new Date("2026-04-01"), null, now)).toBeNull();
  });
  it("is the end of the trial for a church that never subscribed", () => {
    expect(accessEndedAt(new Date("2026-02-10T00:00:00Z"), null, now)?.toISOString()).toBe("2026-02-10T00:00:00.000Z");
  });
  it("is the later of the trial and a cancelled subscription", () => {
    const sub = { status: "cancelled", current_end: "2026-02-20T00:00:00Z", updated_at: "2026-02-05T00:00:00Z" };
    expect(accessEndedAt(new Date("2026-01-15T00:00:00Z"), sub, now)?.toISOString()).toBe("2026-02-20T00:00:00.000Z");
  });
});
