import "server-only";

import { logPlatformEvent } from "@/lib/platform-events/log";

// Deployment state, not runtime CPU/memory — Vercel's public REST API
// doesn't expose per-function CPU metrics; deployment state is the
// closest genuine "is production broken" signal available this way (a
// stuck BUILDING/ERROR deployment is the actual failure mode that matters
// for a serverless app with no fixed server to watch). Real execution
// metrics still live in Vercel's own Observability dashboard, linked from
// the Health page.
export interface VercelDeploymentStatus {
  configured: boolean;
  state: string | null;
  url: string | null;
  inspectorUrl: string | null;
  readyAt: number | null;
  buildDurationMs: number | null;
  errorMessage: string | null;
  fetchError: string | null;
}

const UNCONFIGURED: VercelDeploymentStatus = {
  configured: false,
  state: null,
  url: null,
  inspectorUrl: null,
  readyAt: null,
  buildDurationMs: null,
  errorMessage: null,
  fetchError: null,
};

export async function getLatestProductionDeployment(): Promise<VercelDeploymentStatus> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return UNCONFIGURED;

  const params = new URLSearchParams({ projectId, target: "production", limit: "1" });
  if (process.env.VERCEL_TEAM_ID) params.set("teamId", process.env.VERCEL_TEAM_ID);

  try {
    const response = await fetch(`https://api.vercel.com/v7/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Vercel API responded ${response.status}`);
    }

    const data = await response.json();
    const deployment = data.deployments?.[0];

    if (!deployment) {
      return { ...UNCONFIGURED, configured: true };
    }

    return {
      configured: true,
      state: deployment.readyState ?? deployment.state ?? null,
      url: deployment.url ? `https://${deployment.url}` : null,
      inspectorUrl: deployment.inspectorUrl ?? null,
      readyAt: typeof deployment.ready === "number" ? deployment.ready : null,
      buildDurationMs:
        typeof deployment.ready === "number" && typeof deployment.buildingAt === "number" ? deployment.ready - deployment.buildingAt : null,
      errorMessage: deployment.errorMessage ?? null,
      fetchError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't reach the Vercel API.";
    await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Vercel deployment status fetch failed: ${message}` });
    return { ...UNCONFIGURED, configured: true, fetchError: message };
  }
}
