import { describe, it, expect } from "vitest";
import { limitRate, shouldPauseMarketing, statsFromLog } from "./reputation-rules";

describe("shouldPauseMarketing", () => {
  it("never acts on a small sample", () => {
    expect(shouldPauseMarketing({ resolved: 10, limited: 10 })).toBe(false);
  });
  it("pauses once enough messages were judged and a quarter or more were refused", () => {
    expect(shouldPauseMarketing({ resolved: 40, limited: 10 })).toBe(true);
    expect(shouldPauseMarketing({ resolved: 40, limited: 9 })).toBe(false);
  });
  it("handles no data", () => {
    expect(limitRate({ resolved: 0, limited: 0 })).toBe(0);
  });
});

describe("statsFromLog", () => {
  it("counts only marketing messages whose result is known, and only 131049 as limited", () => {
    const stats = statsFromLog([
      { status: "read", error_code: null, category: "marketing" },
      { status: "delivered", error_code: null, category: "marketing" },
      { status: "failed", error_code: "131049", category: "marketing" },
      { status: "failed", error_code: "131026", category: "marketing" },
      { status: "sent", error_code: null, category: "marketing" },
      { status: "failed", error_code: "131049", category: "utility" },
    ]);
    expect(stats).toEqual({ resolved: 4, limited: 1 });
  });
});
