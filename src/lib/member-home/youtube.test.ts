import { describe, expect, it } from "vitest";
import { youtubeThumbnailUrl, youtubeVideoId, youtubeWatchUrl } from "@/lib/member-home/youtube";

const ID = "dQw4w9WgXcQ";

describe("youtubeVideoId", () => {
  it("reads the common link shapes", () => {
    expect(youtubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(youtubeVideoId(`https://youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
    expect(youtubeVideoId(`https://youtu.be/${ID}?si=abc`)).toBe(ID);
    expect(youtubeVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(youtubeVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(youtubeVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(youtubeVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });
  it("rejects anything else", () => {
    expect(youtubeVideoId("https://vimeo.com/12345")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/@mychurch")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeVideoId("not a link")).toBeNull();
    expect(youtubeVideoId("https://evil.com/watch?v=" + ID)).toBeNull();
  });
  it("builds the watch and thumbnail links", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeThumbnailUrl(ID)).toBe(`https://img.youtube.com/vi/${ID}/hqdefault.jpg`);
  });
});
