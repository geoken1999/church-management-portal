// What the mobile app is told about updates. The platform admin sets, per platform, the newest
// version, the oldest version still allowed to run (anything older must update), the store link
// and the release notes. Stored in platform_settings under "mobile_update".
export type UpdatePlatform = "android" | "ios";

export interface PlatformUpdate {
  latest: string; // e.g. "1.1.1"
  minimum: string; // older than this must update; "" = nothing forced
  storeUrl: string; // https link to the store listing
  notes: string; // what's new, shown in the prompt
}

export type UpdateConfig = Record<UpdatePlatform, PlatformUpdate>;

export const EMPTY_UPDATE: PlatformUpdate = { latest: "", minimum: "", storeUrl: "", notes: "" };

export const SETTING_KEY = "mobile_update";

export function isVersion(value: string): boolean {
  return /^\d+(\.\d+){0,2}$/.test(value.trim());
}

// -1 if a < b, 0 if equal, 1 if a > b. Missing parts count as 0.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function parseConfig(raw: unknown): UpdateConfig {
  const read = (v: unknown): PlatformUpdate => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    return { latest: s("latest"), minimum: s("minimum"), storeUrl: s("storeUrl"), notes: s("notes") };
  };
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { android: read(o.android), ios: read(o.ios) };
}

export type UpdateAnswer = { status: "none" | "optional" | "required"; latest: string; storeUrl: string; notes: string };

// What an app on `current` should do.
export function answerFor(config: PlatformUpdate, current: string): UpdateAnswer {
  const base = { latest: config.latest, storeUrl: config.storeUrl, notes: config.notes };
  if (!config.latest || !isVersion(current)) return { status: "none", ...base };
  if (config.minimum && isVersion(config.minimum) && compareVersions(current, config.minimum) < 0) return { status: "required", ...base };
  if (compareVersions(current, config.latest) < 0) return { status: "optional", ...base };
  return { status: "none", ...base };
}
