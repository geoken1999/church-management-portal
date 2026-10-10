import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Handler = (request: Request) => Promise<Response>;

// Header the Super Admin "Run now" action sets so a run is recorded as
// manual, with who started it. Anyone able to send it can already call the
// route (it's CRON_SECRET-gated), so it only labels a log row.
export const CRON_TRIGGER_HEADER = "x-cron-trigger";

async function readSummary(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await response.clone().json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Wraps a cron route's GET so every run is recorded in cron_job_runs.
// Logging never changes what the route does or returns: a failure to write
// the log is swallowed, and an error thrown by the job is recorded and then
// rethrown unchanged.
export function withCronLogging(jobKey: string, handler: Handler): Handler {
  return async (request) => {
    const triggerHeader = request.headers.get(CRON_TRIGGER_HEADER) ?? "";
    const manual = triggerHeader.startsWith("manual:");
    const admin = createAdminClient();

    let runId: string | null = null;
    try {
      const { data } = await admin
        .from("cron_job_runs")
        .insert({ job_key: jobKey, trigger: manual ? "manual" : "schedule", triggered_by_email: manual ? triggerHeader.slice(7) || null : null })
        .select("id")
        .single();
      runId = data?.id ?? null;
    } catch {}

    const finish = async (patch: Record<string, unknown>) => {
      if (!runId) return;
      try {
        await admin.from("cron_job_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId);
      } catch {}
    };

    try {
      const response = await handler(request);
      await finish({
        status: response.ok ? "success" : "error",
        http_status: response.status,
        summary: await readSummary(response),
        error_message: response.ok ? null : `Responded ${response.status}`,
      });
      return response;
    } catch (err) {
      await finish({ status: "error", error_message: err instanceof Error ? err.message : "Unknown error" });
      throw err;
    }
  };
}
