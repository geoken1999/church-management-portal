import { describe, expect, it } from "vitest";
import { externalLiveActive, parseExternalLink } from "@/lib/livestream/external-link";

describe("parseExternalLink", () => {
  it("reads the usual YouTube forms and finds the video", () => {
    expect(parseExternalLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ platform: "youtube", youtubeVideoId: "dQw4w9WgXcQ" });
    expect(parseExternalLink("https://youtu.be/dQw4w9WgXcQ?si=abc")).toMatchObject({ platform: "youtube", youtubeVideoId: "dQw4w9WgXcQ" });
    expect(parseExternalLink("https://m.youtube.com/live/dQw4w9WgXcQ")).toMatchObject({ platform: "youtube", youtubeVideoId: "dQw4w9WgXcQ" });
  });
  it("accepts a channel's live address, which has no single video to play inside the app", () => {
    expect(parseExternalLink("https://www.youtube.com/@mychurch/live")).toMatchObject({ platform: "youtube", youtubeVideoId: null });
  });
  it("accepts Facebook live and watch links", () => {
    expect(parseExternalLink("https://www.facebook.com/mychurch/videos/123456789")).toMatchObject({ platform: "facebook" });
    expect(parseExternalLink("fb.watch/abc123")).toMatchObject({ platform: "facebook", url: "https://fb.watch/abc123" });
  });
  it("adds https when it is left off", () => {
    expect(parseExternalLink("youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ url: "https://youtube.com/watch?v=dQw4w9WgXcQ" });
  });
  it("refuses other sites, look-alikes, plain http and tricks", () => {
    for (const bad of ["https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.com/x", "https://notyoutube.com/x", "http://youtube.com/x", "https://user:pw@youtube.com/x", "https://youtube.com:8443/x", "javascript:alert(1)", "", "not a link"]) {
      expect("error" in parseExternalLink(bad), bad).toBe(true);
    }
  });
});

describe("externalLiveActive", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  it("shows a live link until it is ended", () => {
    expect(externalLiveActive({ started_at: "2026-10-26T10:00:00Z", ended_at: null }, now)).toBe(true);
    expect(externalLiveActive({ started_at: "2026-10-26T10:00:00Z", ended_at: "2026-10-26T11:00:00Z" }, now)).toBe(false);
  });
  it("stops showing one nobody ended after 12 hours", () => {
    expect(externalLiveActive({ started_at: "2026-10-25T23:00:00Z", ended_at: null }, now)).toBe(false);
  });
});
