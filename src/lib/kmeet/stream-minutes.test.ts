import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-15T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// Two video calls this month: a 60 minute meeting and a 3 hour live stream's room.
const calls = [
  { id: "meeting-1", mode: "video", started_at: hoursAgo(5), ended_at: hoursAgo(4) },
  { id: "stream-room", mode: "video", started_at: hoursAgo(4), ended_at: hoursAgo(1) },
];

// A query builder that answers any chain with the table's rows.
const rowsFor = (table: string) => (table === "kmeet_meetings" ? calls : table === "live_streams" ? [{ meeting_id: "stream-room" }] : []);
const builder = (table: string) => {
  const result = { data: table === "organizations" ? { timezone: "Asia/Kolkata", addon_kmeet_minutes: 0, addon_kmeet_month: null } : rowsFor(table) };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "lt", "or", "in"]) chain[m] = () => chain;
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock("@/lib/plans/dal", () => ({ getPlanLimits: async () => ({ kmeetMaxDurationMinutes: 600, kaudioMaxDurationMinutes: 600 }) }));
vi.mock("@/lib/plans/config", async (original) => ({ ...(await original<typeof import("@/lib/plans/config")>()), kaudioMaxDurationMinutes: () => 600 }));

import { getKmeetMinutes } from "./minutes-service";

describe("K-Connect minutes and live streams", () => {
  it("counts the meeting but not the live stream's room", async () => {
    const minutes = await getKmeetMinutes("org-1", NOW);
    expect(minutes.video.used).toBe(60);
    expect(minutes.video.left).toBe(540);
  });
});
