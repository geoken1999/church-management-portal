import { describe, expect, it } from "vitest";
import { cleanOutputs, cleanSettings, isRtmpUrl } from "@/lib/livestream/validation";

describe("live stream settings", () => {
  it("falls back to safe defaults", () => {
    expect(cleanSettings({ layout: "nope", quality: 5 })).toMatchObject({ layout: "GRID", quality: "high", orientation: "landscape", notify_members: true, chat_enabled: true, record: false });
  });
  it("keeps valid choices", () => {
    expect(cleanSettings({ layout: "SIDEBAR", orientation: "portrait", record: true, notifyMembers: false })).toMatchObject({ layout: "SIDEBAR", orientation: "portrait", record: true, notify_members: false });
  });
});

describe("restream addresses", () => {
  it("accepts rtmp and rtmps only", () => {
    expect(isRtmpUrl("rtmp://a.rtmp.youtube.com/live2")).toBe(true);
    expect(isRtmpUrl("rtmps://live-api-s.facebook.com:443/rtmp/")).toBe(true);
    expect(isRtmpUrl("https://youtube.com")).toBe(false);
  });
  it("needs a key and an address", () => {
    expect(cleanOutputs([{ url: "rtmp://x/live", streamKey: "" }])).toEqual({ error: "Add the stream key for each address." });
    expect(cleanOutputs([{ url: "http://x", streamKey: "k" }])).toEqual({ error: "A stream address must start with rtmp:// or rtmps://." });
    expect(cleanOutputs([{ name: "YouTube", url: "rtmp://x/live", streamKey: "k" }, { url: "", streamKey: "" }])).toEqual([{ name: "YouTube", url: "rtmp://x/live", streamKey: "k" }]);
  });
});
