import "server-only";

import { logPlatformEvent } from "@/lib/platform-events/log";

// The project ref is the subdomain of the project's own URL
// (https://<ref>.supabase.co) — already known from an env var every
// deployment already has, so this needs no separate ref var of its own.
function getProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : null;
}

// What went wrong, in words an admin can act on. A refused token is by far the most common cause.
export class ManagementApiError extends Error {
  constructor(public status: number) {
    super(`Supabase Management API responded ${status}`);
  }
}

export function describeManagementFailure(reason: unknown): string {
  if (reason instanceof ManagementApiError) {
    if (reason.status === 401 || reason.status === 403) {
      return `Supabase refused the access token (${reason.status}). It is invalid or has expired: create a new one in Supabase under Account → Access Tokens, then update SUPABASE_MANAGEMENT_API_TOKEN and redeploy.`;
    }
    if (reason.status === 429) return "Supabase is rate limiting these checks (429). Try again in a minute.";
    return `The Supabase Management API answered with an error (${reason.status}).`;
  }
  return "Couldn't reach the Supabase Management API (a network problem).";
}

async function callManagementApi(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ManagementApiError(response.status);
  }
  return response.json();
}

export interface SupabaseDiskUsage {
  usedBytes: number;
  sizeBytes: number;
  percentUsed: number;
}

export interface SupabaseServiceHealth {
  name: string;
  healthy: boolean;
}

export interface SupabaseProjectStatus {
  configured: boolean;
  disk: SupabaseDiskUsage | null;
  services: SupabaseServiceHealth[] | null;
  fetchError: string | null;
}

const UNCONFIGURED: SupabaseProjectStatus = { configured: false, disk: null, services: null, fetchError: null };

// Response shapes confirmed against Supabase's own OpenAPI spec at fetch
// time: GET /v1/projects/{ref}/config/disk/util returns
// { metrics: { fs_size_bytes, fs_used_bytes, fs_avail_bytes } }.
// GET /v1/projects/{ref}/health?services=... returns an array of
// per-service objects — the exact healthy/status field name isn't
// pinned down in the spec summary, so this checks the couple of shapes
// Supabase is known to use rather than assuming one.
export async function getSupabaseProjectStatus(): Promise<SupabaseProjectStatus> {
  const token = process.env.SUPABASE_MANAGEMENT_API_TOKEN;
  const ref = getProjectRef();
  if (!token || !ref) return UNCONFIGURED;

  try {
    const [diskResult, healthResult] = await Promise.allSettled([
      callManagementApi(`${ref}/config/disk/util`, token),
      callManagementApi(`${ref}/health?services=db,auth,rest,storage,realtime`, token),
    ]);

    let disk: SupabaseDiskUsage | null = null;
    if (diskResult.status === "fulfilled") {
      const metrics = (diskResult.value as { metrics?: { fs_size_bytes?: number; fs_used_bytes?: number } })?.metrics;
      if (metrics?.fs_size_bytes && typeof metrics.fs_used_bytes === "number") {
        disk = {
          usedBytes: metrics.fs_used_bytes,
          sizeBytes: metrics.fs_size_bytes,
          percentUsed: Math.round((metrics.fs_used_bytes / metrics.fs_size_bytes) * 1000) / 10,
        };
      }
    }

    let services: SupabaseServiceHealth[] | null = null;
    if (healthResult.status === "fulfilled" && Array.isArray(healthResult.value)) {
      services = (healthResult.value as Record<string, unknown>[]).map((entry) => {
        const name = String(entry.name ?? entry.service ?? "unknown");
        const healthy =
          entry.healthy === true || entry.status === "ACTIVE_HEALTHY" || entry.status === "COMING_UP" ? Boolean(entry.healthy ?? true) : false;
        return { name, healthy };
      });
    }

    const fetchError =
      diskResult.status === "rejected" && healthResult.status === "rejected" ? describeManagementFailure(diskResult.reason) : null;
    if (fetchError) await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Supabase Management API fetch failed: ${fetchError}` });

    return { configured: true, disk, services, fetchError };
  } catch (err) {
    const message = describeManagementFailure(err);
    await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Supabase Management API fetch failed: ${message}` });
    return { configured: true, disk: null, services: null, fetchError: message };
  }
}
