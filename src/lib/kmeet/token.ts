import "server-only";

import crypto from "node:crypto";
import { getVideoSdkEnv } from "@/lib/kmeet/env";

// A minimal HS256 JWT signer via Node's built-in crypto — VideoSDK's
// tokens are plain HS256 JWTs (apikey + permissions claims), so this
// avoids pulling in the `jsonwebtoken` package for three lines of HMAC
// signing, matching how this app already hand-rolls HMAC verification
// for the Instagram/WhatsApp webhook signatures rather than reaching for
// a library.
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signHS256Jwt(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const signature = crypto.createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  return `${encodedHeader}.${encodedPayload}.${base64url(signature)}`;
}

const TWO_HOURS = 2 * 60 * 60;

// Used only for the server-to-server "create a room" REST call — broad
// permissions, not scoped to any one room, never sent to a browser.
export function generateServerToken(): string {
  const { apiKey, secret } = getVideoSdkEnv();
  return signHS256Jwt({ apikey: apiKey, permissions: ["allow_join", "allow_mod"], version: 2 }, secret, TWO_HOURS);
}

// Used client-side to actually join a call — scoped to one room, so a
// leaked token can't be reused to join (or moderate) a different org's
// meeting.
export function generateParticipantToken(roomId: string): string {
  const { apiKey, secret } = getVideoSdkEnv();
  return signHS256Jwt({ apikey: apiKey, permissions: ["allow_join"], version: 2, roomId }, secret, TWO_HOURS);
}
