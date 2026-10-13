import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform-events/log", () => ({ logPlatformEvent: async () => {} }));

describe("describeManagementFailure", () => {
  it("tells the admin what to do when the token is refused", async () => {
    const { describeManagementFailure, ManagementApiError } = await import("@/lib/platform-admin/supabase-management");
    expect(describeManagementFailure(new ManagementApiError(401))).toMatch(/access token.*SUPABASE_MANAGEMENT_API_TOKEN/);
    expect(describeManagementFailure(new ManagementApiError(403))).toMatch(/refused/);
  });
  it("tells other failures apart", async () => {
    const { describeManagementFailure, ManagementApiError } = await import("@/lib/platform-admin/supabase-management");
    expect(describeManagementFailure(new ManagementApiError(429))).toMatch(/rate limiting/);
    expect(describeManagementFailure(new ManagementApiError(500))).toMatch(/500/);
    expect(describeManagementFailure(new TypeError("fetch failed"))).toMatch(/network/);
  });
});
