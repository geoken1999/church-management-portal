import "server-only";

import { getSiteUrl } from "@/lib/site-url";

// Google Meet, with the church's own Google account. Meet can't be put inside another web page, so KingdomFlow
// creates the meeting room and opens Meet itself (with all of Meet's controls) in a new tab. Uses the same Google Cloud
// OAuth client as YouTube unless GOOGLE_MEET_CLIENT_ID / GOOGLE_MEET_CLIENT_SECRET are set. In that project enable the
// "Google Meet REST API" and add the scope meetings.space.created, and add {site}/api/google-meet/callback as a redirect URI.

const SCOPES = ["https://www.googleapis.com/auth/meetings.space.created", "openid", "email", "profile"].join(" ");
const TOKEN = "https://oauth2.googleapis.com/token";

export function getMeetEnv(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.GOOGLE_MEET_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_MEET_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const meetRedirectUri = () => `${getSiteUrl()}/api/google-meet/callback`;

export function meetAuthorizeUrl(state: string): string {
  const env = getMeetEnv();
  if (!env) throw new Error("Google Meet isn't set up.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", meetRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface MeetTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
}

async function tokenRequest(params: Record<string, string>): Promise<MeetTokens> {
  const env = getMeetEnv();
  if (!env) throw new Error("Google Meet isn't set up.");
  const res = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, ...params }), cache: "no-store" });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}).`);
  const d = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { accessToken: d.access_token, refreshToken: d.refresh_token ?? null, expiresInSeconds: d.expires_in };
}

export const exchangeMeetCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: meetRedirectUri() });
export const refreshMeetToken = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function fetchGoogleUser(accessToken: string): Promise<{ id: string; email: string; name: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't read the Google account.");
  const u = (await res.json()) as { sub: string; email?: string; name?: string };
  return { id: u.sub, email: u.email ?? "", name: u.name ?? u.email ?? "Google account" };
}

/** A new Meet room: it keeps working as a link, and anyone invited can join. */
export async function createMeetSpace(accessToken: string): Promise<{ name: string; meetingUri: string }> {
  const res = await fetch("https://meet.googleapis.com/v2/spaces", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ config: { accessType: "OPEN" } }), cache: "no-store" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // keep the status text
    }
    throw new Error(`Google Meet: ${message}`);
  }
  const s = (await res.json()) as { name: string; meetingUri: string };
  return { name: s.name, meetingUri: s.meetingUri };
}
