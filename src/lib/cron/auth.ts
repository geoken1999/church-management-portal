import { timingSafeEqual } from "node:crypto";

// Who may start a scheduled job. Vercel sends `Authorization: Bearer <CRON_SECRET>` with each cron call, and the
// Super Admin "Run now" button does the same. With no secret set, a job is open to the whole internet, so any
// deployment on Vercel (production or preview) refuses to run it; only a local developer machine may run
// jobs without one.

type Env = Record<string, string | undefined>;

export function cronSecretMissingIsFatal(env: Env = process.env): boolean {
  return Boolean(env.VERCEL_ENV) || env.NODE_ENV === "production";
}

/** Null when the request may run the job; otherwise the answer to send instead (nothing is run or logged). */
export function cronAuthResponse(request: Request, env: Env = process.env): Response | null {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    if (!cronSecretMissingIsFatal(env)) return null;
    return Response.json({ error: "Scheduled jobs are switched off until CRON_SECRET is set." }, { status: 503 });
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
