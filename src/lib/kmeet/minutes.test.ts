import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  minutesLabel,
  minutesLeftFor,
  minutesUsed,
  summarizeMinutes,
  type CallRecord,
} from "./minutes";

const from = new Date("2025-03-01T00:00:00Z");
const to = new Date("2025-04-01T00:00:00Z");
const now = new Date("2025-03-15T12:00:00Z");
const call = (
  mode: "video" | "audio",
  s: string | null,
  e: string | null,
): CallRecord => ({ mode, startedAt: s, endedAt: e });

describe("counting minutes", () => {
  it("counts the time between start and end", () => {
    expect(
      elapsedSeconds(
        call("video", "2025-03-02T10:00:00Z", "2025-03-02T10:20:00Z"),
        from,
        to,
        now,
      ),
    ).toBe(1200);
  });
  it("counts a call that is still running up to now", () => {
    expect(
      elapsedSeconds(
        call("video", "2025-03-15T11:30:00Z", null),
        from,
        to,
        now,
      ),
    ).toBe(1800);
  });
  it("counts only the part of a call that falls in the month", () => {
    expect(
      elapsedSeconds(
        call("audio", "2025-02-28T23:30:00Z", "2025-03-01T00:30:00Z"),
        from,
        to,
        now,
      ),
    ).toBe(1800);
  });
  it("ignores a call that never started", () => {
    expect(elapsedSeconds(call("video", null, null), from, to, now)).toBe(0);
  });
  it("adds video and audio separately and rounds up once", () => {
    const used = minutesUsed(
      [
        call("video", "2025-03-02T10:00:00Z", "2025-03-02T10:10:30Z"),
        call("video", "2025-03-03T10:00:00Z", "2025-03-03T10:05:00Z"),
        call("audio", "2025-03-04T10:00:00Z", "2025-03-04T10:30:00Z"),
      ],
      from,
      to,
      now,
    );
    expect(used).toEqual({ video: 16, audio: 30 });
  });
});

describe("what is left", () => {
  const basic = { video: 20, audio: 30 };
  it("gives each kind its own pool", () => {
    const s = summarizeMinutes(basic, { video: 5, audio: 30 }, 0);
    expect(minutesLeftFor(s, "video")).toBe(15);
    expect(minutesLeftFor(s, "audio")).toBe(0);
  });
  it("uses bought minutes only after a pool runs out, for either kind", () => {
    const fresh = summarizeMinutes(basic, { video: 5, audio: 0 }, 30);
    expect(fresh.extraLeft).toBe(30);
    expect(minutesLeftFor(fresh, "video")).toBe(45);
    const spilled = summarizeMinutes(basic, { video: 35, audio: 40 }, 30);
    expect(spilled.extraLeft).toBe(5); // 15 + 10 spilled over
    expect(minutesLeftFor(spilled, "video")).toBe(5);
    expect(minutesLeftFor(spilled, "audio")).toBe(5);
  });
  it("runs out completely", () => {
    const s = summarizeMinutes(basic, { video: 60, audio: 0 }, 30);
    expect(minutesLeftFor(s, "video")).toBe(0);
  });
  it("is unlimited where the plan is unlimited", () => {
    const s = summarizeMinutes(
      { video: null, audio: null },
      { video: 999, audio: 999 },
      0,
    );
    expect(minutesLeftFor(s, "video")).toBeNull();
  });
});

describe("labels", () => {
  it("reads naturally", () => {
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(60)).toBe("1 h");
    expect(minutesLabel(125)).toBe("2 h 05 min");
  });
});
