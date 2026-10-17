import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatFileSize,
  minutesFromSeconds,
} from "./media-metadata";

describe("media metadata helpers", () => {
  it("rounds the length up to whole minutes, at least one", () => {
    expect(minutesFromSeconds(0)).toBe(0);
    expect(minutesFromSeconds(NaN)).toBe(0);
    expect(minutesFromSeconds(5)).toBe(1);
    expect(minutesFromSeconds(60)).toBe(1);
    expect(minutesFromSeconds(61)).toBe(2);
    expect(minutesFromSeconds(1500)).toBe(25);
  });
  it("formats clock and size", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatFileSize(500)).toBe("1 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
