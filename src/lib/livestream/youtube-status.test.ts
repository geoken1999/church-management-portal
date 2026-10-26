import { describe, expect, it } from "vitest";
import { youtubeLiveState } from "@/lib/livestream/youtube-status";

const item = (snippet: string, details?: Record<string, string>) => ({ items: [{ snippet: { liveBroadcastContent: snippet }, ...(details ? { liveStreamingDetails: details } : {}) }] });

describe("youtubeLiveState", () => {
  it("is live while YouTube says so", () => {
    expect(youtubeLiveState(item("live", { actualStartTime: "2026-10-26T04:00:00Z" }))).toBe("live");
  });
  it("is upcoming for a scheduled stream that has not started", () => {
    expect(youtubeLiveState(item("upcoming", { scheduledStartTime: "x" }))).toBe("upcoming");
  });
  it("is ended once the stream has an end time", () => {
    expect(youtubeLiveState(item("none", { actualStartTime: "a", actualEndTime: "b" }))).toBe("ended");
  });
  it("leaves everything else alone", () => {
    expect(youtubeLiveState(item("none"))).toBe("unknown"); // an ordinary video, never live
    expect(youtubeLiveState({ items: [] })).toBe("unknown"); // deleted, private or a wrong id
    expect(youtubeLiveState(null)).toBe("unknown");
    expect(youtubeLiveState({ error: { code: 403 } })).toBe("unknown");
  });
});
