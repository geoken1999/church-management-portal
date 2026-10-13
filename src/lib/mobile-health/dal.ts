import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MobileAppEvent } from "@/types/database";

export interface CountRow {
  label: string;
  count: number;
}

export interface ErrorGroup {
  fingerprint: string;
  kind: MobileAppEvent["kind"];
  count: number;
  devices: number;
  lastAt: string;
  screen: string;
  message: string;
  stack: string;
  versions: string[];
}

export interface RecentCrash {
  id: string;
  at: string;
  appVersion: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
  screen: string;
  church: string | null;
}

export interface MobileHealth {
  devices: { total: number; active24h: number; active7d: number; active30d: number };
  sessions: { last24h: number; last7d: number };
  errors: { last24h: number; last7d: number };
  crashes: { last24h: number; last7d: number };
  // Share of sessions in the last 7 days that did not end in a suspected crash; null with no sessions.
  crashFreeRate: number | null;
  versions: { version: string; android: number; ios: number; total: number }[];
  platforms: CountRow[];
  osVersions: CountRow[];
  models: CountRow[];
  topErrors: ErrorGroup[];
  recentCrashes: RecentCrash[];
}

const DAY = 86_400_000;
const since = (ms: number) => new Date(Date.now() - ms).toISOString();

function tally(values: string[], limit: number): CountRow[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v || "unknown", (counts.get(v || "unknown") ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getMobileHealth(): Promise<MobileHealth> {
  const admin = createAdminClient();
  const devicesSince = async (ms: number | null) => {
    let q = admin.from("mobile_app_devices").select("*", { count: "exact", head: true });
    if (ms !== null) q = q.gt("last_seen_at", since(ms));
    const { count } = await q;
    return count ?? 0;
  };
  const eventsSince = async (kind: MobileAppEvent["kind"], ms: number) => {
    const { count } = await admin.from("mobile_app_events").select("*", { count: "exact", head: true }).eq("kind", kind).gt("created_at", since(ms));
    return count ?? 0;
  };

  const [total, a24, a7, a30, s24, s7, e24, e7, c24, c7] = await Promise.all([
    devicesSince(null),
    devicesSince(DAY),
    devicesSince(7 * DAY),
    devicesSince(30 * DAY),
    eventsSince("session", DAY),
    eventsSince("session", 7 * DAY),
    eventsSince("error", DAY),
    eventsSince("error", 7 * DAY),
    eventsSince("crash_suspected", DAY),
    eventsSince("crash_suspected", 7 * DAY),
  ]);

  const [{ data: devices }, { data: events }] = await Promise.all([
    admin.from("mobile_app_devices").select("platform, app_version, os_version, device_model").gt("last_seen_at", since(30 * DAY)).limit(5000),
    admin
      .from("mobile_app_events")
      .select("id, device_id, kind, platform, app_version, os_version, device_model, screen, message, stack, fingerprint, organization_id, created_at")
      .in("kind", ["error", "crash_suspected"])
      .gt("created_at", since(7 * DAY))
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);

  const versionMap = new Map<string, { android: number; ios: number }>();
  for (const d of devices ?? []) {
    const entry = versionMap.get(d.app_version || "unknown") ?? { android: 0, ios: 0 };
    entry[d.platform] += 1;
    versionMap.set(d.app_version || "unknown", entry);
  }
  const versions = [...versionMap.entries()]
    .map(([version, v]) => ({ version, ...v, total: v.android + v.ios }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  const groups = new Map<string, ErrorGroup & { deviceSet: Set<string>; versionSet: Set<string> }>();
  for (const e of events ?? []) {
    const key = `${e.kind}|${e.fingerprint}`;
    let g = groups.get(key);
    if (!g) {
      g = { fingerprint: e.fingerprint, kind: e.kind, count: 0, devices: 0, lastAt: e.created_at, screen: e.screen, message: e.message, stack: e.stack, versions: [], deviceSet: new Set(), versionSet: new Set() };
      groups.set(key, g);
    }
    g.count += 1;
    g.deviceSet.add(e.device_id);
    if (e.app_version) g.versionSet.add(e.app_version);
  }
  const topErrors = [...groups.values()]
    .map((g) => ({ fingerprint: g.fingerprint, kind: g.kind, count: g.count, devices: g.deviceSet.size, lastAt: g.lastAt, screen: g.screen, message: g.message, stack: g.stack, versions: [...g.versionSet] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const crashEvents = (events ?? []).filter((e) => e.kind === "crash_suspected").slice(0, 20);
  const orgIds = [...new Set(crashEvents.map((e) => e.organization_id).filter((id): id is string => Boolean(id)))];
  const { data: orgs } = orgIds.length ? await admin.from("organizations").select("id, name").in("id", orgIds) : { data: [] };
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return {
    devices: { total, active24h: a24, active7d: a7, active30d: a30 },
    sessions: { last24h: s24, last7d: s7 },
    errors: { last24h: e24, last7d: e7 },
    crashes: { last24h: c24, last7d: c7 },
    crashFreeRate: s7 > 0 ? Math.max(0, 1 - c7 / s7) : null,
    versions,
    platforms: tally((devices ?? []).map((d) => d.platform), 4),
    osVersions: tally((devices ?? []).map((d) => `${d.platform === "ios" ? "iOS" : "Android"} ${d.os_version}`), 8),
    models: tally((devices ?? []).map((d) => d.device_model), 8),
    topErrors,
    recentCrashes: crashEvents.map((e) => ({
      id: e.id,
      at: e.created_at,
      appVersion: e.app_version,
      platform: e.platform,
      osVersion: e.os_version,
      deviceModel: e.device_model,
      screen: e.screen,
      church: e.organization_id ? (orgName.get(e.organization_id) ?? null) : null,
    })),
  };
}
