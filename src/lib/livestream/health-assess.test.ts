import { describe, expect, it } from "vitest";
import { assessHealth } from "@/lib/livestream/health-assess";

const feed = { reachable: true, ageSeconds: 1.5, targetSeconds: 2 };
const none = { count: 0, bufferingCount: 0, avgRttMs: null, avgBufferedMs: null, stalls: 0 };

describe("assessHealth", () => {
  it("is offline when not live", () => {
    expect(assessHealth({ live: false, ingestActive: false, feed, viewers: none }).level).toBe("offline");
  });
  it("is good with a fresh feed and calm viewers", () => {
    const h = assessHealth({ live: true, ingestActive: false, feed, viewers: { count: 20, bufferingCount: 1, avgRttMs: 300, avgBufferedMs: 6000, stalls: 2 } });
    expect(h.level).toBe("good");
    expect(h.estimatedDelaySeconds).toBeCloseTo(10, 0);
  });
  it("is poor when the feed has stopped", () => {
    const h = assessHealth({ live: true, ingestActive: true, feed: { reachable: true, ageSeconds: 40, targetSeconds: 2 }, viewers: none });
    expect(h.level).toBe("poor");
    expect(h.reasons[0]).toMatch(/No new video/);
  });
  it("is poor when the feed can't be reached", () => {
    expect(assessHealth({ live: true, ingestActive: false, feed: { reachable: false, ageSeconds: null, targetSeconds: null }, viewers: none }).level).toBe("poor");
  });
  it("gets worse as more viewers buffer", () => {
    const base = { live: true, ingestActive: false, feed };
    expect(assessHealth({ ...base, viewers: { count: 10, bufferingCount: 1, avgRttMs: 200, avgBufferedMs: 5000, stalls: 0 } }).level).toBe("fair");
    expect(assessHealth({ ...base, viewers: { count: 10, bufferingCount: 4, avgRttMs: 200, avgBufferedMs: 5000, stalls: 0 } }).level).toBe("poor");
  });
  it("flags a big delay", () => {
    const h = assessHealth({ live: true, ingestActive: false, feed, viewers: { count: 5, bufferingCount: 0, avgRttMs: 200, avgBufferedMs: 30000, stalls: 0 } });
    expect(h.level).toBe("fair");
  });
});
