import "server-only";

import crypto from "node:crypto";

// The "state" value sent to Zoom or Google and returned to us, so a stranger can't make someone connect the wrong
// account. It is signed and carries who started the connection, the church and the provider, so it does not depend on a
// cookie (a cookie set on one address is not sent to another, and on plain http a secure one is not kept at all).

const LIFETIME_MS = 15 * 60 * 1000;

function key(): Buffer {
  const raw = process.env.CONNECTION_SECRETS_KEY;
  if (!raw) throw new Error("CONNECTION_SECRETS_KEY must be set.");
  return Buffer.from(raw, "base64");
}

const sign = (body: string) => crypto.createHmac("sha256", key()).update(`conference-oauth:${body}`).digest("base64url");

export function makeOAuthState(userId: string, organizationId: string, provider: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, o: organizationId, p: provider, e: now + LIFETIME_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function checkOAuthState(state: string | null, userId: string, organizationId: string, provider: string, now = Date.now()): boolean {
  if (!state) return false;
  const [body, signature] = state.split(".");
  if (!body || !signature) return false;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as { u?: string; o?: string; p?: string; e?: number };
    return parsed.u === userId && parsed.o === organizationId && parsed.p === provider && typeof parsed.e === "number" && parsed.e > now;
  } catch {
    return false;
  }
}
