import { describe, expect, it } from "vitest";
import {
  describeEventChange,
  matchRegistrantsToAuthIds,
  type EventSnapshot,
} from "@/lib/events/change-summary";

const base: EventSnapshot = {
  title: "Youth Camp",
  start_at: "2026-11-01T10:00:00Z",
  end_at: null,
  venue: "Hall",
  meeting_link: null,
  status: "active",
};

describe("describeEventChange", () => {
  it("reports a cancellation", () => {
    expect(
      describeEventChange(base, { ...base, status: "cancelled" })?.headline,
    ).toBe("Event cancelled");
  });
  it("lists what changed", () => {
    const result = describeEventChange(base, {
      ...base,
      venue: "Church",
      start_at: "2026-11-01T11:00:00Z",
    });
    expect(result?.detail).toContain("the time and the venue");
  });
  it("ignores changes registrants don't care about", () => {
    expect(describeEventChange(base, { ...base })).toBeNull();
    expect(
      describeEventChange(
        { ...base, status: "cancelled" },
        { ...base, status: "cancelled", venue: "x" },
      ),
    ).toBeNull();
  });
});

describe("matchRegistrantsToAuthIds", () => {
  it("matches by email or the last 10 digits of the phone", () => {
    const ids = matchRegistrantsToAuthIds(
      [
        { email: "A@x.com", phone: null },
        { email: null, phone: "+91 98765 43210" },
      ],
      [
        { auth_user_id: "u1", email: "a@x.com", phone: null },
        { auth_user_id: "u2", email: null, phone: "9876543210" },
        { auth_user_id: "u3", email: "other@x.com", phone: "1111111111" },
        { auth_user_id: null, email: "a@x.com", phone: null },
      ],
    );
    expect(ids.sort()).toEqual(["u1", "u2"]);
  });
});
