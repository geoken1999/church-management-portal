import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveSessions,
  getPlatformEventsWithChurch,
} from "@/lib/platform-admin/dal";
import {
  getChurchUsageReport,
  monthWindow,
  totalSent,
} from "@/lib/platform-admin/usage-report";
import { membershipPeriodFor } from "@/lib/membership-fees/config";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { sessionSource } from "@/lib/platform-admin/session-source";
import { getCronJobs, loadCronHandler } from "@/lib/cron/registry";
import { describeSchedule, lastExpectedRun } from "@/lib/cron/schedule";
import { CRON_TRIGGER_HEADER } from "@/lib/cron/run-logger";
import { isAutoDeleteOn, setAutoDelete } from "@/lib/retention/settings";
import { daysSince, deletionDate, nextAction } from "@/lib/retention/rules";
import { getMobileHealth, getMobileVersions } from "@/lib/mobile-health/dal";
import { getWebVersion } from "@/lib/version";
import { getUpdateConfig } from "@/lib/mobile/update-store";
import { getWhatsAppHealth } from "@/lib/whatsapp/health";
import { shouldPauseMarketing } from "@/lib/whatsapp/reputation-rules";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { CronJobRun, PlatformEventLevel } from "@/types/database";
import { day, fail, ok, when, type AdminSection } from "./common";

const usage: AdminSection = {
  key: "usage",
  scope: "operations",
  title: "Church usage",
  description: "Messages each church sent this month, by channel",
  icon: "bar_chart",
  async load(filter) {
    const current = membershipPeriodFor(new Date(), DEFAULT_TIMEZONE);
    const month = filter && monthWindow(filter) ? filter : current;
    const rows = await getChurchUsageReport(monthWindow(month)!);
    const base = new Date();
    const months: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
      const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      months.push({ value: v, label: v });
    }
    const t = rows.reduce(
      (a, r) => ({
        email: a.email + r.email.sent,
        sms: a.sms + r.sms.sent,
        whatsapp: a.whatsapp + r.whatsapp.sent,
        failed: a.failed + r.email.failed + r.sms.failed + r.whatsapp.failed,
      }),
      { email: 0, sms: 0, whatsapp: 0, failed: 0 },
    );
    return {
      title: `Church usage · ${month}`,
      filter: { label: "Month", value: month, options: months },
      summary: [
        { label: "Emails", value: String(t.email) },
        { label: "SMS", value: String(t.sms) },
        { label: "WhatsApp", value: String(t.whatsapp) },
        { label: "Failed", value: String(t.failed) },
      ],
      groups: [
        {
          items: [...rows]
            .sort((a, b) => totalSent(b) - totalSent(a))
            .map((r) => ({
              id: r.organizationId,
              title: r.organizationName,
              subtitle: r.planName,
              badge: `${totalSent(r)} sent`,
              fields: [
                { label: "Email", value: `${r.email.sent} sent · ${r.email.failed} failed · ${r.email.campaigns} campaigns` },
                { label: "SMS", value: `${r.sms.sent} sent · ${r.sms.failed} failed · ${r.sms.campaigns} campaigns` },
                { label: "WhatsApp", value: `${r.whatsapp.sent} sent · ${r.whatsapp.failed} failed · ${r.whatsapp.campaigns} campaigns` },
                { label: "Membership emails", value: String(r.membershipEmails) },
                { label: "Automation messages", value: String(r.automationMessages) },
                { label: "AI replies", value: String(r.aiReplies) },
                ...Object.entries(r.deliveryByStatus).map(([k, v]) => ({ label: `Delivery: ${k}`, value: String(v) })),
              ],
            })),
        },
      ],
      empty: "No messages sent this month.",
    };
  },
};

const sessions: AdminSection = {
  key: "sessions",
  scope: "operations",
  title: "Active sessions",
  description: "Who is signed in right now; sign someone out",
  icon: "devices",
  async load() {
    const all = await getActiveSessions();
    return {
      title: "Active sessions",
      summary: [{ label: "Signed in", value: String(all.length) }],
      groups: [
        {
          items: all.map((s) => ({
            id: s.sessionId,
            title: s.memberName ?? s.userEmail,
            subtitle: `${s.organizationNames.join(", ") || "No church"} · ${sessionSource(s.userAgent)}`,
            badge: `active ${when(s.updatedAt)}`,
            fields: [
              { label: "Sign-in", value: s.userEmail },
              { label: "Phone", value: s.userPhone ?? "—" },
              { label: "Started", value: when(s.createdAt) },
              { label: "IP", value: s.ip ?? "—" },
              { label: "Device", value: s.userAgent ?? "—" },
            ],
            actions: [
              {
                key: "revoke",
                label: "Sign out",
                danger: true,
                confirm: "Force this session to sign out? Their next request fails.",
              },
            ],
          })),
        },
      ],
      empty: "No active sessions.",
    };
  },
  async act(caller, action, id) {
    if (action !== "revoke" || !id) return fail("Unknown action.");
    await createAdminClient().rpc("admin_revoke_session", { target_session_id: id });
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Platform admin (${caller.email}) revoked a session (admin app)`,
      metadata: { sessionId: id },
    });
    return ok("Signed out.");
  },
};

const cron: AdminSection = {
  key: "cron",
  scope: "operations",
  title: "Cron jobs",
  description: "Scheduled jobs, whether they ran, and run one now",
  icon: "schedule",
  async load() {
    const jobs = getCronJobs();
    const { data } = await createAdminClient()
      .from("cron_job_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(300);
    const runs = (data ?? []) as CronJobRun[];
    const now = new Date();
    return {
      title: "Cron jobs",
      groups: [
        {
          items: jobs.map((job) => {
            const mine = runs.filter((r) => r.job_key === job.key);
            const last = mine[0];
            const lastScheduled = mine.find((r) => r.trigger === "schedule");
            const expected = lastExpectedRun(job.schedule, now);
            const missed =
              expected &&
              (!lastScheduled || new Date(lastScheduled.started_at).getTime() < expected.getTime());
            return {
              id: job.key,
              title: job.label,
              subtitle: `${describeSchedule(job.schedule)}`,
              badge: missed ? "missed" : (last?.status ?? "never run"),
              tone: missed || last?.status === "error" ? ("bad" as const) : last?.status === "success" ? ("good" as const) : undefined,
              body: job.description,
              fields: [
                { label: "Last run", value: last ? `${when(last.started_at)} (${last.trigger})` : "—" },
                { label: "Result", value: last?.error_message ?? (last?.summary ? JSON.stringify(last.summary).slice(0, 400) : "—") },
                ...mine.slice(0, 5).map((r) => ({ label: when(r.started_at), value: `${r.status}${r.http_status ? ` · HTTP ${r.http_status}` : ""} · ${r.trigger}` })),
              ],
              actions: [
                {
                  key: "run",
                  label: "Run now",
                  confirm: `Run "${job.label}" right now? Anything already sent today is not sent twice.`,
                },
              ],
            };
          }),
        },
      ],
    };
  },
  async act(caller, action, id) {
    if (action !== "run" || !id) return fail("Unknown action.");
    const job = getCronJobs().find((j) => j.key === id);
    const handler = job ? await loadCronHandler(id) : null;
    if (!job || !handler) return fail("Unknown job.");
    const headers: Record<string, string> = {
      [CRON_TRIGGER_HEADER]: `manual:${caller.email}`,
    };
    if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Platform admin (${caller.email}) manually ran cron job "${job.label}" (admin app)`,
      metadata: { jobKey: id },
    });
    try {
      const response = await handler(new Request(`http://localhost${job.path}`, { headers }));
      return response.ok ? ok(`Finished (HTTP ${response.status}).`) : fail(`The job responded ${response.status}.`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "The job failed.");
    }
  },
};

const LEVELS = ["error", "warning", "info"] as const;
const logs: AdminSection = {
  key: "logs",
  scope: "operations",
  title: "Logs",
  description: "Platform events: errors, warnings and admin actions",
  icon: "list_alt",
  async load(filter) {
    const level = (LEVELS as readonly string[]).includes(filter ?? "")
      ? (filter as PlatformEventLevel)
      : undefined;
    const events = await getPlatformEventsWithChurch({ level, limit: 200 });
    return {
      title: "Logs",
      filter: {
        label: "Level",
        value: level ?? "all",
        options: [{ value: "all", label: "All" }, ...LEVELS.map((l) => ({ value: l, label: l }))],
      },
      groups: [
        {
          items: events.map((e) => ({
            id: e.id,
            title: e.message,
            subtitle: `${e.churchName ?? "Platform"} · ${e.source} · ${when(e.created_at)}`,
            badge: e.level,
            tone: e.level === "error" ? ("bad" as const) : e.level === "warning" ? ("warn" as const) : ("info" as const),
            body: Object.keys(e.metadata ?? {}).length ? JSON.stringify(e.metadata, null, 2) : undefined,
          })),
        },
      ],
      empty: "Nothing logged.",
    };
  },
};

const retention: AdminSection = {
  key: "retention",
  scope: "operations",
  title: "Lapsed churches",
  description: "Churches whose access ended and when they are deleted",
  icon: "hourglass_bottom",
  async load() {
    const admin = createAdminClient();
    const now = new Date();
    const auto = await isAutoDeleteOn();
    const [{ data: rows }, { data: deleted }] = await Promise.all([
      admin.from("organization_retention").select("*").order("expired_since", { ascending: true }),
      admin.from("deleted_organizations").select("*").order("deleted_at", { ascending: false }).limit(20),
    ]);
    const ids = (rows ?? []).map((r) => r.organization_id);
    const { data: orgs } = ids.length
      ? await admin.from("organizations").select("id, name").in("id", ids)
      : { data: [] };
    const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    return {
      title: "Lapsed churches",
      note: "A lapsed church is reminded weekly and deleted for good after 30 days, unless it resubscribes or you mark it to keep.",
      summary: [{ label: "Automatic deletion", value: auto ? "ON" : "OFF" }],
      actions: [
        auto
          ? { key: "auto_off", label: "Turn automatic deletion OFF" }
          : {
              key: "auto_on",
              label: "Turn automatic deletion ON",
              danger: true,
              confirm: "Turn ON automatic deletion? Churches past their deadline will be deleted permanently by the daily job.",
            },
      ],
      groups: [
        {
          title: "Waiting",
          items: (rows ?? []).map((r) => {
            const since = new Date(r.expired_since);
            const next = nextAction(
              {
                expiredSince: since,
                remindersSent: r.reminders_sent,
                finalWarningSentAt: r.final_warning_sent_at ? new Date(r.final_warning_sent_at) : null,
              },
              now,
            );
            return {
              id: r.organization_id,
              title: names.get(r.organization_id) ?? "Unknown church",
              subtitle: `Lapsed ${day(r.expired_since)} · day ${daysSince(since, now)}`,
              badge: r.exempt ? "kept forever" : `deletes ${day(deletionDate(since).toISOString())}`,
              tone: r.exempt ? ("good" as const) : next === "delete" ? ("bad" as const) : ("warn" as const),
              fields: [
                { label: "Next step", value: next },
                { label: "Reminders sent", value: String(r.reminders_sent) },
                { label: "Final warning", value: r.final_warning_sent_at ? when(r.final_warning_sent_at) : "Not yet" },
                { label: "Blocked", value: r.blocked_reason ?? "—" },
              ],
              actions: [
                r.exempt
                  ? { key: "unkeep", label: "Stop keeping forever" }
                  : { key: "keep", label: "Keep forever", confirm: "This church will never be auto-deleted." },
              ],
            };
          }),
        },
        {
          title: "Recently deleted",
          items: (deleted ?? []).map((d) => ({
            id: String(d.organization_id ?? d.id),
            title: String(d.name ?? "Deleted church"),
            subtitle: `Deleted ${day(String(d.deleted_at))}`,
          })),
        },
      ].filter((g) => g.items.length > 0),
      empty: "No lapsed churches.",
    };
  },
  async act(caller, action, id) {
    if (action === "auto_on" || action === "auto_off") {
      await setAutoDelete(action === "auto_on");
      await logPlatformEvent({
        level: "warning",
        source: "platform_admin",
        message: `Platform admin (${caller.email}) turned automatic deletion of lapsed churches ${action === "auto_on" ? "ON" : "OFF"} (admin app)`,
      });
      return ok("Saved.");
    }
    if ((action === "keep" || action === "unkeep") && id) {
      const exempt = action === "keep";
      const { error } = await createAdminClient()
        .from("organization_retention")
        .update({ exempt, updated_at: new Date().toISOString() })
        .eq("organization_id", id);
      if (error) return fail("Couldn't save that.");
      await logPlatformEvent({
        level: "warning",
        source: "platform_admin",
        message: `Platform admin (${caller.email}) ${exempt ? "marked a church to keep forever" : "removed a church's keep-forever mark"} (admin app)`,
        organizationId: id,
      });
      return ok("Saved.");
    }
    return fail("Unknown action.");
  },
};

const versions: AdminSection = {
  key: "versions",
  scope: "operations",
  title: "Versions",
  description: "Web build and which app versions people use",
  icon: "system_update",
  async load() {
    const web = getWebVersion();
    const [mobile, update] = await Promise.all([getMobileVersions(), getUpdateConfig()]);
    return {
      title: "Versions",
      summary: [
        { label: "Web", value: `v${web.version}` },
        { label: "Commit", value: web.commitShort || "—" },
        { label: "Android newest", value: mobile.newest.android ? `${mobile.newest.android.version} (${mobile.newest.android.build})` : "—" },
        { label: "Devices behind (Android)", value: String(mobile.behind.android) },
      ],
      note: web.message || undefined,
      groups: [
        {
          title: "App versions in use",
          items: mobile.rows.map((r) => ({
            id: `${r.platform}-${r.version}-${r.build}`,
            title: `${r.platform === "android" ? "Android" : "iPhone"} ${r.version} (${r.build})`,
            badge: `${r.devices} devices`,
            subtitle: `${r.activeLast7d} active in 7 days · last seen ${when(r.lastSeen)}`,
          })),
        },
        {
          title: "Update prompt settings",
          items: [
            {
              id: "update-config",
              title: "Current settings",
              body: JSON.stringify(update, null, 2),
            },
          ],
        },
      ],
    };
  },
};

const mobileHealth: AdminSection = {
  key: "mobile-health",
  scope: "operations",
  title: "Mobile app health",
  description: "Crashes, errors and devices from the member and team apps",
  icon: "phone_android",
  async load() {
    const h = await getMobileHealth();
    return {
      title: "Mobile app health",
      summary: [
        { label: "Devices (24h / 7d / 30d)", value: `${h.devices.active24h} / ${h.devices.active7d} / ${h.devices.active30d}` },
        { label: "Crash-free sessions", value: h.crashFreeRate === null ? "—" : `${(h.crashFreeRate * 100).toFixed(1)}%` },
        { label: "Errors (24h / 7d)", value: `${h.errors.last24h} / ${h.errors.last7d}` },
        { label: "Crashes (24h / 7d)", value: `${h.crashes.last24h} / ${h.crashes.last7d}` },
      ],
      groups: [
        {
          title: "Top errors",
          items: h.topErrors.map((e) => ({
            id: `${e.kind}-${e.fingerprint}`,
            title: e.message.slice(0, 120) || "(no message)",
            subtitle: `${e.screen} · last ${when(e.lastAt)}`,
            badge: `${e.count}×`,
            tone: e.kind === "crash_suspected" ? ("bad" as const) : ("warn" as const),
            fields: [
              { label: "Devices", value: String(e.devices) },
              { label: "Versions", value: e.versions.join(", ") },
            ],
            body: e.stack,
          })),
        },
        {
          title: "App versions",
          items: h.versions.map((v) => ({
            id: `v-${v.version}`,
            title: v.version,
            badge: `${v.total} devices`,
            subtitle: `Android ${v.android} · iPhone ${v.ios}`,
          })),
        },
      ],
    };
  },
};

const whatsappHealth: AdminSection = {
  key: "whatsapp-health",
  scope: "operations",
  title: "WhatsApp health",
  description: "How WhatsApp treats each church's marketing messages",
  icon: "chat",
  async load() {
    const table = await getWhatsAppHealth();
    return {
      title: "WhatsApp health",
      groups: [
        {
          items: table.map((o) => {
            const paused = o.onShared && shouldPauseMarketing(o.week) && !o.override;
            return {
              id: o.id,
              title: o.name,
              subtitle: o.onShared ? "Shared number" : "Own number",
              badge: paused ? "paused" : o.override ? "pause lifted" : "ok",
              tone: paused ? ("bad" as const) : ("good" as const),
              fields: [
                { label: "Last 7 days", value: `${o.week.limited} refused of ${o.week.resolved}` },
                { label: "Last 30 days", value: `${o.month.limited} refused of ${o.month.resolved}` },
              ],
              actions: o.onShared
                ? [
                    o.override
                      ? { key: "restore", label: "Restore the pause" }
                      : { key: "lift", label: "Lift pause", confirm: "Allow this church to send marketing again?" },
                  ]
                : undefined,
            };
          }),
        },
      ],
      empty: "No tracked WhatsApp messages in the last 30 days.",
    };
  },
  async act(caller, action, id) {
    if ((action !== "lift" && action !== "restore") || !id) return fail("Unknown action.");
    const allow = action === "lift";
    const { error } = await createAdminClient()
      .from("organizations")
      .update({ whatsapp_marketing_override: allow })
      .eq("id", id);
    if (error) return fail("Couldn't save that.");
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Platform admin (${caller.email}) ${allow ? "lifted" : "restored"} the WhatsApp marketing pause (admin app)`,
      organizationId: id,
    });
    return ok("Saved.");
  },
};

export const operationsSections = [
  usage,
  sessions,
  cron,
  logs,
  retention,
  versions,
  mobileHealth,
  whatsappHealth,
];
