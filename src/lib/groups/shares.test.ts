import { describe, it, expect } from "vitest";
import { isGroupKey, parseGroupPost } from "./shares";

describe("parseGroupPost", () => {
  it("accepts a message, a link, or both", () => {
    expect(parseGroupPost({ title: "Camp info", body: "Bring a Bible", linkUrl: "" }).post).toEqual({ title: "Camp info", body: "Bring a Bible", linkUrl: null });
    expect(parseGroupPost({ title: "Schedule", body: "", linkUrl: "https://example.org/x" }).post).toEqual({ title: "Schedule", body: null, linkUrl: "https://example.org/x" });
  });

  it("needs a title and something to share", () => {
    expect(parseGroupPost({ title: "a", body: "x", linkUrl: "" }).error).toBeDefined();
    expect(parseGroupPost({ title: "Camp info", body: "", linkUrl: "" }).error).toBeDefined();
  });

  it("only allows https links", () => {
    expect(parseGroupPost({ title: "Link", body: "", linkUrl: "http://example.org" }).error).toBeDefined();
    expect(parseGroupPost({ title: "Link", body: "", linkUrl: "javascript:alert(1)" }).error).toBeDefined();
    expect(parseGroupPost({ title: "Link", body: "", linkUrl: "not a url" }).error).toBeDefined();
  });
});

describe("isGroupKey", () => {
  it("accepts only the five groups", () => {
    expect(isGroupKey("youth")).toBe(true);
    expect(isGroupKey("everyone")).toBe(false);
    expect(isGroupKey(null)).toBe(false);
  });
});
