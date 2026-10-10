import { describe, it, expect } from "vitest";
import { sanitizeLayout, newBlock, MAX_BLOCKS } from "./schema";

const ORG = "11111111-1111-1111-1111-111111111111";
const FILE = "22222222-2222-2222-2222-222222222222";

describe("sanitizeLayout", () => {
  it("accepts a default new block of every type", () => {
    const banner = { ...newBlock("banner"), slides: [{ imagePath: `${ORG}/${FILE}.jpg`, linkUrl: "" }] };
    const blocks = [banner, newBlock("welcome"), { ...newBlock("announcement"), title: "Hi" }, newBlock("quick_links"), newBlock("upcoming_events")];
    expect(sanitizeLayout({ version: 1, blocks }).layout?.blocks).toHaveLength(5);
  });

  it("rejects non-https image and button links", () => {
    const announcementImage = { ...newBlock("announcement"), title: "x", imageUrl: "http://example.com/a.png" };
    expect(sanitizeLayout({ blocks: [announcementImage] }).error).toMatch(/https/);
    const announcement = { ...newBlock("announcement"), title: "x", buttonLabel: "Go", buttonUrl: "javascript:alert(1)" };
    expect(sanitizeLayout({ blocks: [announcement] }).error).toMatch(/https/);
  });

  it("requires an announcement to say something, and a button to be complete", () => {
    expect(sanitizeLayout({ blocks: [newBlock("announcement")] }).error).toBeDefined();
    const half = { ...newBlock("announcement"), title: "x", buttonLabel: "Go" };
    expect(sanitizeLayout({ blocks: [half] }).error).toBeDefined();
  });

  it("requires website quick links to have an https url, and drops unknown fields", () => {
    const bad = { ...newBlock("quick_links"), links: [{ label: "Site", icon: "link", target: "url", url: "ftp://x" }] };
    expect(sanitizeLayout({ blocks: [bad] }).error).toBeDefined();
    const ok = { ...newBlock("quick_links"), evil: "x", links: [{ label: "Site", icon: "link", target: "url", url: "https://x.org", extra: 1 }] };
    const result = sanitizeLayout({ blocks: [ok] });
    expect(JSON.stringify(result.layout)).not.toContain("evil");
    expect(JSON.stringify(result.layout)).not.toContain("extra");
  });

  it("clamps the event count and caps the number of sections", () => {
    const events = { ...newBlock("upcoming_events"), count: 99 };
    expect(sanitizeLayout({ blocks: [events] }).layout?.blocks[0]).toMatchObject({ count: 10 });
    const many = Array.from({ length: MAX_BLOCKS + 1 }, () => newBlock("welcome"));
    expect(sanitizeLayout({ blocks: many }).error).toBeDefined();
  });

  it("rejects duplicate ids and unknown types", () => {
    const a = newBlock("welcome");
    expect(sanitizeLayout({ blocks: [a, a] }).error).toBeDefined();
    expect(sanitizeLayout({ blocks: [{ id: "x", type: "script" }] }).error).toBeDefined();
  });
});

describe("banner blocks", () => {
  const slide = { imagePath: `${ORG}/${FILE}.jpg`, linkUrl: "" };

  it("needs at least one image and at most six", () => {
    expect(sanitizeLayout({ blocks: [newBlock("banner")] }).error).toBeDefined();
    const seven = { ...newBlock("banner"), slides: Array.from({ length: 7 }, () => slide) };
    expect(sanitizeLayout({ blocks: [seven] }).error).toBeDefined();
  });

  it("only accepts images from the church's own folder", () => {
    const banner = { ...newBlock("banner"), slides: [slide] };
    expect(sanitizeLayout({ blocks: [banner] }, ORG).error).toBeUndefined();
    expect(sanitizeLayout({ blocks: [banner] }, "99999999-9999-9999-9999-999999999999").error).toBeDefined();
    const traversal = { ...newBlock("banner"), slides: [{ imagePath: "../etc/passwd", linkUrl: "" }] };
    expect(sanitizeLayout({ blocks: [traversal] }, ORG).error).toBeDefined();
  });

  it("keeps the autoplay choice for a single slide and rejects non-https links", () => {
    const single = { ...newBlock("banner"), slides: [slide], autoplaySeconds: 5 };
    expect(sanitizeLayout({ blocks: [single] }).layout?.blocks[0]).toMatchObject({ autoplaySeconds: 5 });
    const bad = { ...newBlock("banner"), slides: [{ ...slide, linkUrl: "http://x.org" }] };
    expect(sanitizeLayout({ blocks: [bad] }).error).toBeDefined();
  });
});
