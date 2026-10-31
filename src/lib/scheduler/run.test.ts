import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmail = vi.fn();
const sendSms = vi.fn();
const sendWhatsApp = vi.fn();
vi.mock("@/lib/email/send", () => ({ sendEmailCampaign: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/sms/send", () => ({ sendSmsCampaign: (...a: unknown[]) => sendSms(...a) }));
vi.mock("@/lib/whatsapp/send-campaign", () => ({ sendWhatsAppCampaign: (...a: unknown[]) => sendWhatsApp(...a) }));
const sendBroadcast = vi.fn();
vi.mock("@/lib/push/broadcast", () => ({ sendBroadcast: (...a: unknown[]) => sendBroadcast(...a) }));
vi.mock("@/lib/push/client", () => ({ sendPushToUsers: vi.fn(async () => ({})) }));
vi.mock("@/lib/platform-events/log", () => ({ logPlatformEvent: vi.fn(async () => {}) }));

type Row = Record<string, unknown>;

// A small in-memory stand-in for the database client: just the calls the runner makes.
function fakeAdmin(tables: Record<string, Row[]>) {
  const removed: string[] = [];
  const builder = (table: string) => {
    let rows = tables[table] ?? [];
    let patch: Row | null = null;
    const filters: ((r: Row) => boolean)[] = [];
    let wantRows = false;
    const api: Record<string, unknown> = {
      select: () => { wantRows = true; return api; },
      update: (p: Row) => { patch = p; return api; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api; },
      lt: (k: string, v: string) => { filters.push((r) => String(r[k]) < v); return api; },
      lte: (k: string, v: string) => { filters.push((r) => String(r[k]) <= v); return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => { const hit = run(); return { data: hit[0] ?? null }; },
      then: (resolve: (v: { data: Row[] }) => void) => resolve({ data: run() }),
    };
    function run(): Row[] {
      rows = tables[table] ?? [];
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) for (const r of hit) Object.assign(r, patch);
      return wantRows || !patch ? hit : [];
    }
    return api;
  };
  return {
    from: builder,
    storage: { from: () => ({ download: async () => ({ data: null }), remove: async (paths: string[]) => { removed.push(...paths); } }) },
    removed,
  };
}

const NOW = new Date("2026-10-14T10:00:00Z");
const base = { organization_id: "org", created_by: "user", attachments: [], recipient_count: 2, summary: "Hello", started_at: null, finished_at: null, result: null };

describe("runDueCampaigns", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendSms.mockReset();
    sendWhatsApp.mockReset();
    sendBroadcast.mockReset();
  });

  it("sends a scheduled push notification to its audience when an admin scheduled it", async () => {
    sendBroadcast.mockResolvedValue({ success: true, sent: 7 });
    const payload = { audienceType: "group", groupKey: "youth", title: "Youth night", body: "Tonight at 7" };
    const tables = {
      scheduled_campaigns: [{ ...base, id: "p", channel: "push", status: "scheduled", scheduled_at: "2026-10-14T09:58:00Z", payload }],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "admin", tab_permissions: null }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect(sendBroadcast).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org", userId: "user", audienceType: "group", groupKey: "youth", title: "Youth night" }));
    expect(tables.scheduled_campaigns[0]).toMatchObject({ status: "sent", result: { sentCount: 7 } });
  });

  it("puts a repeating notification back on the schedule for its next time", async () => {
    sendBroadcast.mockResolvedValue({ success: true, sent: 3 });
    const tables = {
      scheduled_campaigns: [{ ...base, id: "r", channel: "push", repeat: "weekly", repeat_until: null, status: "scheduled", scheduled_at: "2026-10-14T03:30:00Z", payload: { audienceType: "church", title: "Sunday", body: "See you", anchorDay: 14 } }],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "owner", tab_permissions: null }],
      organizations: [{ id: "org", timezone: "Asia/Kolkata" }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect(tables.scheduled_campaigns[0]).toMatchObject({ status: "scheduled", scheduled_at: "2026-10-21T03:30:00.000Z", result: { sentCount: 3 } });
  });

  it("finishes a repeating notification once its last day has passed", async () => {
    sendBroadcast.mockResolvedValue({ success: true, sent: 3 });
    const tables = {
      scheduled_campaigns: [{ ...base, id: "r", channel: "push", repeat: "daily", repeat_until: "2026-10-14T18:29:00Z", status: "scheduled", scheduled_at: "2026-10-14T03:30:00Z", payload: { audienceType: "church", title: "Daily", body: "Verse" } }],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "owner", tab_permissions: null }],
      organizations: [{ id: "org", timezone: "Asia/Kolkata" }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(tables.scheduled_campaigns[0].status).toBe("sent");
  });

  it("does not send a scheduled push whose scheduler is no longer an admin", async () => {
    const tables = {
      scheduled_campaigns: [{ ...base, id: "p", channel: "push", status: "scheduled", scheduled_at: "2026-10-14T09:58:00Z", payload: { audienceType: "church", title: "Hi", body: "There" } }],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "member", tab_permissions: null }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result).toMatchObject({ failed: 1 });
    expect(sendBroadcast).not.toHaveBeenCalled();
  });

  it("sends what is due, not what is later, and records the result", async () => {
    sendSms.mockResolvedValue({ success: true, sentCount: 2, failedCount: 0 });
    const tables = {
      scheduled_campaigns: [
        { ...base, id: "due", channel: "sms", status: "scheduled", scheduled_at: "2026-10-14T09:58:00Z", payload: { body: "Hi", recipients: [{ phone: "1" }] } },
        { ...base, id: "later", channel: "sms", status: "scheduled", scheduled_at: "2026-10-14T12:00:00Z", payload: { body: "Hi", recipients: [] } },
      ],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "owner", tab_permissions: null }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result).toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(tables.scheduled_campaigns[0]).toMatchObject({ status: "sent", result: { sentCount: 2 } });
    expect(tables.scheduled_campaigns[1].status).toBe("scheduled");
  });

  it("never sends one that is already being sent", async () => {
    const tables = {
      scheduled_campaigns: [{ ...base, id: "x", channel: "sms", status: "sending", started_at: "2026-10-14T09:59:00Z", scheduled_at: "2026-10-14T09:58:00Z", payload: { body: "Hi", recipients: [] } }],
      organization_members: [],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result.due).toBe(0);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("marks a campaign failed, without sending, when its owner lost permission", async () => {
    const tables = {
      scheduled_campaigns: [{ ...base, id: "x", channel: "email", status: "scheduled", scheduled_at: "2026-10-14T09:58:00Z", payload: { subject: "S", html: "<p>x</p>", recipients: ["a@b.co"] } }],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "member", tab_permissions: { email: { read: true, write: false, delete: false } } }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result).toMatchObject({ due: 1, sent: 0, failed: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(tables.scheduled_campaigns[0]).toMatchObject({ status: "failed" });
    expect(String((tables.scheduled_campaigns[0].result as unknown as { error: string }).error)).toMatch(/no longer has permission/);
  });

  it("records the reason when the send itself fails", async () => {
    sendWhatsApp.mockResolvedValue({ error: "This template hasn't been approved by WhatsApp yet." });
    const tables = {
      scheduled_campaigns: [{ ...base, id: "x", channel: "whatsapp", status: "scheduled", scheduled_at: "2026-10-14T09:58:00Z", payload: { templateId: "t", specsInput: [], recipients: [] } }],
      organization_members: [{ organization_id: "org", auth_user_id: "user", role: "admin", tab_permissions: null }],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(tables.scheduled_campaigns[0]).toMatchObject({ status: "failed", result: { error: "This template hasn't been approved by WhatsApp yet." } });
  });

  it("fails one stuck in sending instead of sending it twice", async () => {
    const tables = {
      scheduled_campaigns: [{ ...base, id: "x", channel: "sms", status: "sending", started_at: "2026-10-14T09:00:00Z", scheduled_at: "2026-10-14T08:59:00Z", payload: { body: "Hi", recipients: [] } }],
      organization_members: [],
    };
    const { runDueCampaigns } = await import("@/lib/scheduler/run");
    const result = await runDueCampaigns(fakeAdmin(tables) as never, NOW);
    expect(result.stuck).toBe(1);
    expect(tables.scheduled_campaigns[0].status).toBe("failed");
    expect(sendSms).not.toHaveBeenCalled();
  });
});
