import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAllFeatureFlags } from "@/lib/platform-admin/feature-flags";
import { getPlatformStorageStats } from "@/lib/platform-admin/dal";
import { TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
import type { FeatureStatus } from "@/lib/platform-admin/feature-status";
import { MODULES, type HealthSource, type ModuleDef } from "@/lib/module-health/registry";
import { healthLabel, percentOf, summarizeActivity, trendBetween, type ActivityRow, type ModuleHealthLabel, type TrendInfo } from "@/lib/module-health/math";

// Reads across every church to show how each module of the product is being used: how much is in it, how much
// is happening, which churches use it, and what is going wrong. Nothing here is a new measurement: it is counted
// from the rows churches already make, so it needs no setup and starts with full history.

const ROW_CAP = 20_000;
const CACHE_MS = 3 * 60_000;

export interface SourceHealth {
  noun: string;
  total: number;
  last7: number;
  last30: number;
  prev30: number;
  trend: TrendInfo;
  weekly: number[];
  daily: number[];
  churchesEver: number;
  churchesActive30: number;
  /** True when the table has more rows than were read, so the weekly and church figures cover the newest ones. */
  capped: boolean;
  topChurches: { organizationId: string; name: string; last30: number }[];
}

export interface ModuleHealth {
  key: TabKey;
  label: string;
  group: ModuleDef["group"];
  status: FeatureStatus;
  tracked: boolean;
  records: SourceHealth | null;
  activity: SourceHealth | null;
  /** Churches with anything in the module in the last 30 days (records or activity). */
  activeChurches30: number;
  /** Churches that have ever had anything in it. */
  churchesEver: number;
  /** Share of all churches that have ever used it, 0-100. */
  adoptionPercent: number;
  errors7d: number;
  health: ModuleHealthLabel;
}

export interface ModuleError {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
  churchName: string | null;
}

export interface ModuleHealthReport {
  generatedAt: string;
  totalChurches: number;
  activeChurches30: number;
  modules: ModuleHealth[];
  storage: { fileStorageBytes: number; databaseBytes: number } | null;
  errors7d: number;
  errors: Record<string, ModuleError[]>;
}

async function readSource(source: HealthSource, now: Date): Promise<{ rows: ActivityRow[]; total: number; capped: boolean }> {
  const admin = createAdminClient();
  // The table name is data (the registry), so the typed client can't see it: the registry is checked against the
  // real database by a test.
  const db = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { count } = await db.from(source.table).select("*", { count: "exact", head: true });
  const total = count ?? 0;
  const rows: ActivityRow[] = [];
  const column = source.dateColumn;
  for (let from = 0; from < ROW_CAP; from += 1000) {
    const { data } = await db
      .from(source.table)
      .select(column ? `organization_id, ${column}` : "organization_id")
      .order(column ?? "organization_id", { ascending: false })
      .range(from, from + 999);
    for (const r of (data ?? []) as Record<string, string>[]) {
      // A table with no date still says which churches have rows; its rows just can't be placed in time.
      if (r.organization_id) rows.push({ organizationId: r.organization_id, date: column ? (r[column] ?? "") : "" });
    }
    if (!data || data.length < 1000) break;
  }
  void now;
  return { rows, total, capped: total > ROW_CAP };
}

function toSourceHealth(source: HealthSource, read: { rows: ActivityRow[]; total: number; capped: boolean }, names: Map<string, string>, now: Date): SourceHealth {
  const sum = summarizeActivity(read.rows, now, 12);
  const top = [...sum.last30ByChurch.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([organizationId, last30]) => ({ organizationId, name: names.get(organizationId) ?? "Church", last30 }));
  return {
    noun: source.noun,
    total: read.total,
    last7: sum.last7,
    last30: sum.last30,
    prev30: sum.prev30,
    trend: trendBetween(sum.last30, sum.prev30),
    weekly: sum.weekly,
    daily: sum.daily,
    churchesEver: sum.churchesEver.size,
    churchesActive30: sum.last30ByChurch.size,
    capped: read.capped,
    topChurches: top,
  };
}

let cache: { at: number; report: ModuleHealthReport } | null = null;

export async function getModuleHealthReport(force = false): Promise<ModuleHealthReport> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.report;
  const now = new Date();
  const admin = createAdminClient();

  const [{ data: orgs }, flags, storage, { data: events }] = await Promise.all([
    admin.from("organizations").select("id, name"),
    getAllFeatureFlags(),
    getPlatformStorageStats(),
    admin
      .from("platform_events")
      .select("id, level, source, message, created_at, organization_id")
      .in("level", ["error", "warning"])
      .gte("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const totalChurches = names.size;
  const statusOf = new Map(flags.map((f) => [f.tab, f.status]));

  // Every source, a few at a time so a page load doesn't open 80 database calls at once.
  const wanted = MODULES.flatMap((m) => [m.records, m.activity].filter((x): x is HealthSource => Boolean(x)));
  const unique = [...new Map(wanted.map((w) => [w.table, w])).values()];
  const reads = new Map<string, Awaited<ReturnType<typeof readSource>>>();
  for (let i = 0; i < unique.length; i += 6) {
    await Promise.all(
      unique.slice(i, i + 6).map(async (source) => {
        try {
          reads.set(source.table, await readSource(source, now));
        } catch {
          reads.set(source.table, { rows: [], total: 0, capped: false });
        }
      }),
    );
  }

  const errorEvents = new Map<string, ModuleError[]>();
  const sourceToModule = new Map<string, TabKey>();
  for (const m of MODULES) for (const e of m.errorSources ?? []) sourceToModule.set(e, m.key);
  let errors7d = 0;
  for (const e of events ?? []) {
    const key = sourceToModule.get(e.source);
    if (!key) continue;
    if (e.level === "error") errors7d += 1;
    const list = errorEvents.get(key) ?? [];
    list.push({ id: e.id, level: e.level, source: e.source, message: e.message, createdAt: e.created_at, churchName: e.organization_id ? (names.get(e.organization_id) ?? "Deleted church") : null });
    errorEvents.set(key, list);
  }

  const activeAnywhere = new Set<string>();
  const modules: ModuleHealth[] = MODULES.map((def) => {
    const records = def.records ? toSourceHealth(def.records, reads.get(def.records.table)!, names, now) : null;
    const activity = def.activity ? toSourceHealth(def.activity, reads.get(def.activity.table)!, names, now) : null;
    const orgsEver = new Set<string>();
    const orgsActive = new Set<string>();
    for (const src of [def.records, def.activity]) {
      if (!src) continue;
      const rows = reads.get(src.table)?.rows ?? [];
      const sum = summarizeActivity(rows, now, 1);
      sum.churchesEver.forEach((id) => orgsEver.add(id));
      sum.last30ByChurch.forEach((_, id) => orgsActive.add(id));
    }
    orgsActive.forEach((id) => activeAnywhere.add(id));
    const errs = errorEvents.get(def.key) ?? [];
    const errorsCount = errs.filter((e) => e.level === "error").length;
    const tracked = Boolean(def.records || def.activity);
    return {
      key: def.key,
      label: TAB_LABELS[def.key],
      group: def.group,
      status: statusOf.get(def.key) ?? "live",
      tracked,
      records,
      activity,
      activeChurches30: orgsActive.size,
      churchesEver: orgsEver.size,
      adoptionPercent: percentOf(orgsEver.size, totalChurches),
      errors7d: errorsCount,
      health: tracked ? healthLabel({ churchesEver: orgsEver.size, active30: orgsActive.size, errors7d: errorsCount }) : "unused",
    };
  });

  const report: ModuleHealthReport = {
    generatedAt: now.toISOString(),
    totalChurches,
    activeChurches30: activeAnywhere.size,
    modules,
    storage,
    errors7d,
    errors: Object.fromEntries(errorEvents),
  };
  cache = { at: Date.now(), report };
  return report;
}
