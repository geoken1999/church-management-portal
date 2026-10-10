import { describe, it, expect } from "vitest";
import { sanitizeLayout, newBlock, MAX_BLOCKS } from "./schema";

describe("sanitizeLayout", () => {
  it("accepts a default new block of every type", () => {
    const blocks = [newBlock("welcome"), { ...newBlock("announcement"), title: "Hi" }, newBlock("quick_links"), newBlock("upcoming_events")];
    expect(sanitizeLayout({ version: 1, blocks }).layout?.blocks).toHaveLength(4);
  });

  it("rejects non-https image and button links", () => {
    const welcome = { ...newBlock("welcome"), imageUrl: "http://example.com/a.png" };
    expect(sanitizeLayout({ blocks: [welcome] }).error).toMatch(/https/);
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
