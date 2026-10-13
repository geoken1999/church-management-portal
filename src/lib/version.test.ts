import { describe, expect, it } from "vitest";
import { compareVersions } from "@/lib/version";

describe("compareVersions", () => {
  it("orders by major, minor and patch, not as text", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
  });
  it("uses the build number when the version is the same", () => {
    expect(compareVersions("1.0.0", "1.0.0", "3", "2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0", "1", "1")).toBe(0);
  });
});
