import { describe, expect, it } from "vitest";
import { feedbackDue, filterVisitors, phoneKey, validateFeedback, validateVisit } from "./rules";

describe("phoneKey", () => {
  it("is the last 10 digits, whatever the format", () => {
    expect(phoneKey("+91 98765 43210")).toBe("9876543210");
    expect(phoneKey("09876543210")).toBe("9876543210");
    expect(phoneKey("9876543210")).toBe("9876543210");
    expect(phoneKey("(555) 123-4567")).toBe("5551234567");
    expect(phoneKey(null)).toBe("");
  });
});

describe("validateVisit", () => {
  const ok = { name: "Ann Joseph", phone: "98765 43210", email: "", prayerRequest: "" };
  it("accepts a name and a number, with email and prayer optional", () => {
    expect(validateVisit(ok)).toEqual({});
    expect(validateVisit({ ...ok, email: "ann@x.com", prayerRequest: "Pray for my mother" })).toEqual({});
  });
  it("needs a name and a usable number, and a sane email", () => {
    expect(validateVisit({ ...ok, name: " A " }).name).toBeTruthy();
    expect(validateVisit({ ...ok, phone: "123" }).phone).toBeTruthy();
    expect(validateVisit({ ...ok, email: "ann@" }).email).toBeTruthy();
    expect(validateVisit({ ...ok, prayerRequest: "x".repeat(1001) }).prayerRequest).toBeTruthy();
  });
});

describe("validateFeedback", () => {
  it("needs a rating and an answer about follow-up; comments are optional", () => {
    expect(validateFeedback({ rating: 5, text: "", wantsFollowup: false })).toBeNull();
    expect(validateFeedback({ rating: 0, text: "", wantsFollowup: true })).toMatch(/rating/);
    expect(validateFeedback({ rating: 4, text: "", wantsFollowup: null })).toMatch(/follow-up/);
    expect(validateFeedback({ rating: 4, text: "x".repeat(1501), wantsFollowup: true })).toMatch(/comments/);
  });
});

describe("feedbackDue", () => {
  it("is the day after the visit, and not for old visits", () => {
    expect(feedbackDue("2026-10-24", "2026-10-24")).toBe(false);
    expect(feedbackDue("2026-10-24", "2026-10-25")).toBe(true);
    expect(feedbackDue("2026-10-24", "2026-10-31")).toBe(true);
    expect(feedbackDue("2026-10-24", "2026-11-02")).toBe(false);
  });
});

describe("filterVisitors", () => {
  const v = [
    { id: 1, wants_followup: true, followed_up_at: null, feedback_at: "t" },
    { id: 2, wants_followup: true, followed_up_at: "t", feedback_at: "t" },
    { id: 3, wants_followup: false, followed_up_at: null, feedback_at: "t" },
    { id: 4, wants_followup: null, followed_up_at: null, feedback_at: null },
  ];
  it("filters", () => {
    expect(filterVisitors(v, "all")).toHaveLength(4);
    expect(filterVisitors(v, "followup").map((x) => x.id)).toEqual([1]);
    expect(filterVisitors(v, "awaiting").map((x) => x.id)).toEqual([4]);
  });
});
