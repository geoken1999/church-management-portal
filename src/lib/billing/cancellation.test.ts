import { describe, expect, it } from "vitest";
import { cancelMode, cancellationDue } from "@/lib/billing/cancellation";

const now = new Date("2026-10-16T10:00:00Z");

describe("cancelMode", () => {
  it("lets a live subscription run to the end of its paid period", () => {
    expect(cancelMode("active", "2026-11-01T00:00:00Z", now)).toBe(
      "at_period_end",
    );
  });
  it("cancels at once when nothing was paid for", () => {
    expect(cancelMode("created", null, now)).toBe("immediate");
    expect(cancelMode("halted", "2026-11-01T00:00:00Z", now)).toBe("immediate");
    expect(cancelMode("active", "2026-10-01T00:00:00Z", now)).toBe("immediate");
    expect(cancelMode("active", null, now)).toBe("immediate");
  });
});

describe("cancellationDue", () => {
  it("is due only once the period has ended", () => {
    expect(cancellationDue(true, "2026-11-01T00:00:00Z", now)).toBe(false);
    expect(cancellationDue(true, "2026-10-16T09:00:00Z", now)).toBe(true);
    expect(cancellationDue(false, "2026-10-01T00:00:00Z", now)).toBe(false);
  });
});
