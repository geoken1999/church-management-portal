"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getCronJobs, loadCronHandler } from "@/lib/cron/registry";
import { CRON_TRIGGER_HEADER } from "@/lib/cron/run-logger";
import { logPlatformEvent } from "@/lib/platform-events/log";

const CRON_PATH = "/platform-admin/cron";

export interface RunCronJobResult {
  ok: boolean;
  message: string;
}

// Runs a cron job right now, exactly as Vercel would: the route's own
// GET handler is called with the same CRON_SECRET bearer token, so every
// guard and idempotency rule inside the job still applies (a message
// already sent today is not sent twice). The run is recorded as manual,
// with who started it.
export async function runCronJobAction(jobKey: string): Promise<RunCronJobResult> {
  const user = await requirePlatformAdmin();

  const job = getCronJobs().find((j) => j.key === jobKey);
  const handler = job ? await loadCronHandler(jobKey) : null;
  if (!job || !handler) return { ok: false, message: "Unknown job." };

  const headers: Record<string, string> = { [CRON_TRIGGER_HEADER]: `manual:${user.email ?? "unknown"}` };
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  await logPlatformEvent({
    level: "warning",
    source: "platform_admin",
    message: `Platform admin (${user.email ?? "unknown"}) manually ran cron job "${job.label}"`,
    metadata: { jobKey },
  });

  try {
    const response = await handler(new Request(`http://localhost${job.path}`, { headers }));
    revalidatePath(CRON_PATH);
    return response.ok
      ? { ok: true, message: `Finished (HTTP ${response.status}). See the run history below for the result.` }
      : { ok: false, message: `The job responded ${response.status}.` };
  } catch (err) {
    revalidatePath(CRON_PATH);
    return { ok: false, message: err instanceof Error ? err.message : "The job failed." };
  }
}
