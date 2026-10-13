import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/livestream/videosdk", () => ({ roomUsage: async () => null }));

describe("session usage helpers", () => {
  it("estimates viewer data from watch time and quality", async () => {
    const { estimateEgressMb } = await import("@/lib/platform-admin/session-usage");
    // 1 hour at Full HD (about 2 Mbps) is roughly 900 MB.
    expect(Math.round(estimateEgressMb(3600, "high", false))).toBe(900);
    expect(estimateEgressMb(3600, "low", false)).toBeLessThan(estimateEgressMb(3600, "high", false));
    expect(estimateEgressMb(3600, "high", true)).toBeLessThan(estimateEgressMb(3600, "low", false));
  });
  it("formats durations and sizes", async () => {
    const { formatDuration, formatDataSize } = await import("@/lib/platform-admin/session-usage");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(5400)).toBe("1 h 30 min");
    expect(formatDataSize(512)).toBe("512 MB");
    expect(formatDataSize(2048)).toBe("2.00 GB");
  });
});
