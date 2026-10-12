import { describe, expect, it } from "vitest";
import { validatePushAction } from "@/lib/push/link";

describe("validatePushAction", () => {
  it("allows no link and no button", () => {
    expect(validatePushAction({ linkUrl: "", buttonLabel: "" })).toEqual({ linkUrl: null, buttonLabel: null });
  });
  it("accepts an https link with a button", () => {
    expect(validatePushAction({ linkUrl: "https://meet.example.com/abc", buttonLabel: "Join" })).toEqual({ linkUrl: "https://meet.example.com/abc", buttonLabel: "Join" });
  });
  it("rejects a button with no link", () => {
    expect(validatePushAction({ linkUrl: "", buttonLabel: "Join" })).toHaveProperty("error");
  });
  it("rejects non-https and invalid links", () => {
    expect(validatePushAction({ linkUrl: "http://x.com", buttonLabel: "" })).toHaveProperty("error");
    expect(validatePushAction({ linkUrl: "javascript:alert(1)", buttonLabel: "" })).toHaveProperty("error");
    expect(validatePushAction({ linkUrl: "not a link", buttonLabel: "" })).toHaveProperty("error");
  });
  it("limits the button text", () => {
    expect(validatePushAction({ linkUrl: "https://x.com", buttonLabel: "a".repeat(25) })).toHaveProperty("error");
  });
});
