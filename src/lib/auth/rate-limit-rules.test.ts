import { describe, expect, it } from "vitest";
import { blockedMessage, decide } from "@/lib/auth/rate-limit-rules";

const now = new Date("2026-10-16T10:00:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("decide", () => {
  it("allows attempts below the limit", () => {
    expect(decide([minsAgo(1), minsAgo(2), minsAgo(3), minsAgo(4)], 5, 15, now).blocked).toBe(false);
  });

  it("blocks at the limit until the oldest counted attempt expires", () => {
    const result = decide([minsAgo(14), minsAgo(10), minsAgo(5), minsAgo(3), minsAgo(1)], 5, 15, now);
    expect(result).toEqual({ blocked: true, retryAfterMinutes: 1 });
    const early = decide([minsAgo(2), minsAgo(2), minsAgo(2), minsAgo(1), minsAgo(1)], 5, 15, now);
    expect(early).toEqual({ blocked: true, retryAfterMinutes: 13 });
  });

  it("ignores attempts outside the window", () => {
    expect(decide([minsAgo(40), minsAgo(30), minsAgo(20), minsAgo(16), minsAgo(2)], 5, 15, now).blocked).toBe(false);
  });

  it("words the wait", () => {
    expect(blockedMessage(1)).toContain("1 minute.");
    expect(blockedMessage(7)).toContain("7 minutes.");
  });
});
