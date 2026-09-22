import { describe, it, expect } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats seconds under a minute as 0:SS", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  it("pads single-digit seconds", () => {
    expect(formatDuration(5)).toBe("0:05");
  });

  it("formats minutes and seconds without an hour component", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("omits the hour component just under an hour", () => {
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("includes a padded hour component at exactly one hour", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  it("formats multi-hour durations with padded minutes and seconds", () => {
    expect(formatDuration(7325)).toBe("2:02:05");
  });

  it("formats zero as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });
});
