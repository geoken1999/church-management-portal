import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  blockedMessage,
  decide,
  type AttemptRule,
} from "@/lib/auth/rate-limit-rules";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0] ??
    h.get("x-real-ip") ??
    "unknown"
  ).trim();
}

async function keysFor(rule: AttemptRule, email: string) {
  const ip = await clientIp();
  return {
    emailKey: `${rule.action}:email:${hash(email.trim().toLowerCase())}`,
    ipKey: `${rule.action}:ip:${hash(ip)}`,
  };
}

async function timesFor(
  key: string,
  windowMinutes: number,
  now: Date,
): Promise<Date[]> {
  const since = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  const { data } = await createAdminClient()
    .from("auth_attempts")
    .select("created_at")
    .eq("key", key)
    .gt("created_at", since);
  return (data ?? []).map((r) => new Date(r.created_at));
}

// A message to show when this email or IP has used up its attempts, or null to go ahead.
// If the check itself fails it lets the attempt through: a database hiccup must not lock everyone out.
export async function checkAttemptLimit(
  rule: AttemptRule,
  email: string,
): Promise<string | null> {
  try {
    const now = new Date();
    const { emailKey, ipKey } = await keysFor(rule, email);
    const [byEmail, byIp] = await Promise.all([
      timesFor(emailKey, rule.windowMinutes, now),
      timesFor(ipKey, rule.windowMinutes, now),
    ]);
    const a = decide(byEmail, rule.perEmail, rule.windowMinutes, now);
    const b = decide(byIp, rule.perIp, rule.windowMinutes, now);
    if (!a.blocked && !b.blocked) return null;
    return blockedMessage(Math.max(a.retryAfterMinutes, b.retryAfterMinutes));
  } catch (err) {
    console.error("checkAttemptLimit failed:", err);
    return null;
  }
}

// Remember one attempt (a failed sign-in, or a reset request) against the email and the IP.
export async function recordAttempt(
  rule: AttemptRule,
  email: string,
): Promise<void> {
  try {
    const { emailKey, ipKey } = await keysFor(rule, email);
    const admin = createAdminClient();
    await admin
      .from("auth_attempts")
      .insert([{ key: emailKey }, { key: ipKey }]);
    // Tidy up now and then so the table stays small.
    if (Math.random() < 0.02)
      await admin
        .from("auth_attempts")
        .delete()
        .lt("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  } catch (err) {
    console.error("recordAttempt failed:", err);
  }
}

// After a successful sign-in the person's own failed attempts no longer count against them.
export async function clearAttempts(
  rule: AttemptRule,
  email: string,
): Promise<void> {
  try {
    const { emailKey } = await keysFor(rule, email);
    await createAdminClient()
      .from("auth_attempts")
      .delete()
      .eq("key", emailKey);
  } catch (err) {
    console.error("clearAttempts failed:", err);
  }
}
