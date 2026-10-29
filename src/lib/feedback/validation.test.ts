import { describe, it, expect } from "vitest";
import { parseFeedback } from "./validation";

describe("parseFeedback", () => {
  it("accepts a rating on its own", () => {
    const r = parseFeedback({ rating: 5 });
    expect(r.ok && r.feedback).toMatchObject({ rating: 5, category: "other", message: "" });
  });
  it("rejects a missing or out-of-range rating", () => {
    expect(parseFeedback({}).ok).toBe(false);
    expect(parseFeedback({ rating: 0 }).ok).toBe(false);
    expect(parseFeedback({ rating: 6 }).ok).toBe(false);
    expect(parseFeedback(null).ok).toBe(false);
  });
  it("asks for a few words when the rating is low", () => {
    expect(parseFeedback({ rating: 1 }).ok).toBe(false);
    expect(parseFeedback({ rating: 2, message: "slow" }).ok).toBe(false);
    expect(parseFeedback({ rating: 2, message: "It is very slow" }).ok).toBe(true);
    expect(parseFeedback({ rating: 3 }).ok).toBe(true);
  });
  it("trims, caps and falls back on unknown categories", () => {
    const r = parseFeedback({ rating: 4, category: "rant", message: `  ${"a".repeat(3000)}  `, screen: "x".repeat(200) });
    expect(r.ok && r.feedback.category).toBe("other");
    expect(r.ok && r.feedback.message.length).toBe(2000);
    expect(r.ok && r.feedback.screen.length).toBe(80);
  });
});
