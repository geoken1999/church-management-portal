import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";

// A real, live timing of the portal's own landing page — not a synthetic
// guess, and not Vercel's per-visitor Speed Insights (Real User
// Monitoring across many actual visitors, which needs its own client-side
// script and isn't retrievable via a simple API call). This is a single
// server-side round trip each time the Health page loads: request sent,
// full response body drained, clock stopped — the same shape as
// getDatabaseHealth's timing check.
export interface PortalResponseTime {
  url: string;
  reachable: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
}

export async function getPortalResponseTime(): Promise<PortalResponseTime> {
  const url = getSiteUrl();
  const start = Date.now();

  try {
    const response = await fetch(url, { cache: "no-store", redirect: "follow" });
    // Draining the body means the timing reflects the full page arriving,
    // not just the response headers.
    await response.text();
    return { url, reachable: response.ok, statusCode: response.status, responseTimeMs: Date.now() - start };
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Portal response time check failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return { url, reachable: false, statusCode: null, responseTimeMs: null };
  }
}
