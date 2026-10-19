import { describe, expect, it } from "vitest";
import {
  PlaybackReporter,
  isDirectMediaUrl,
  resumePoint,
} from "./playback-reporter";

describe("PlaybackReporter", () => {
  it("reports the first spot, then waits for the interval", () => {
    const r = new PlaybackReporter(15000);
    expect(r.shouldReport(0, 1)).toBe(true);
    expect(r.shouldReport(5000, 6)).toBe(false);
    expect(r.shouldReport(16000, 17)).toBe(true);
  });
  it("never reports the same spot twice, even when forced", () => {
    const r = new PlaybackReporter();
    expect(r.shouldReport(0, 10)).toBe(true);
    expect(r.shouldReport(1, 10, true)).toBe(false);
  });
  it("a forced report ignores the interval", () => {
    const r = new PlaybackReporter();
    r.shouldReport(0, 1);
    expect(r.shouldReport(100, 2, true)).toBe(true);
  });
  it("ignores negative positions", () => {
    expect(new PlaybackReporter().shouldReport(0, -1)).toBe(false);
  });
});

describe("resumePoint", () => {
  it("resumes mid-way, not at the very start or the very end", () => {
    expect(resumePoint(120, 600)).toBe(120);
    expect(resumePoint(2, 600)).toBe(0);
    expect(resumePoint(598, 600)).toBe(0);
  });
});

describe("isDirectMediaUrl", () => {
  it("accepts https media files only", () => {
    expect(isDirectMediaUrl("https://x.com/a/b.mp4")).toBe(true);
    expect(isDirectMediaUrl("https://x.com/a.MP3?x=1")).toBe(true);
    expect(isDirectMediaUrl("http://x.com/a.mp4")).toBe(false);
    expect(isDirectMediaUrl("https://youtube.com/watch?v=1")).toBe(false);
    expect(isDirectMediaUrl("nope")).toBe(false);
  });
});
