import "server-only";

import { getSiteUrl } from "@/lib/site-url";

// Zoom, through one KingdomFlow app on the Zoom Marketplace (a General app with OAuth and the Meeting SDK turned on).
// Each church connects its own Zoom account to it. ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET are that app's credentials; the
// same pair signs the tokens the Meeting SDK needs to join or start a meeting in the browser.
// Scopes to add to the app: meeting:write:meeting, meeting:delete:meeting, user:read:user, user:read:zak.

export const ZOOM_SDK_VERSION = "6.10.0";
const OAUTH = "https://zoom.us/oauth";
const API = "https://api.zoom.us/v2";

export function getZoomEnv(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const zoomRedirectUri = () => `${getSiteUrl()}/api/zoom/callback`;

export function zoomAuthorizeUrl(state: string): string {
  const env = getZoomEnv();
  if (!env) throw new Error("Zoom isn't set up.");
  const url = new URL(`${OAUTH}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", zoomRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

export interface ZoomTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

async function tokenRequest(params: Record<string, string>): Promise<ZoomTokens> {
  const env = getZoomEnv();
  if (!env) throw new Error("Zoom isn't set up.");
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zoom sign-in failed (${res.status}).`);
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresInSeconds: data.expires_in };
}

export const exchangeZoomCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: zoomRedirectUri() });
/** Zoom hands out a new refresh token each time, and the old one stops working: the caller must store the new one. */
export const refreshZoomToken = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

async function zoomApi<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      // keep the status text
    }
    throw new Error(`Zoom: ${message}`);
  }
  return (await res.json()) as T;
}

export async function fetchZoomUser(accessToken: string): Promise<{ id: string; email: string; name: string }> {
  const u = await zoomApi<{ id: string; email: string; display_name?: string; first_name?: string; last_name?: string }>(accessToken, "/users/me");
  return { id: u.id, email: u.email, name: u.display_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email };
}

export interface ZoomMeetingInput {
  topic: string;
  /** ISO time for a scheduled meeting; omit to make one to start right away. */
  startTime?: string;
  durationMinutes: number;
  timezone: string;
}

export async function createZoomMeeting(accessToken: string, input: ZoomMeetingInput): Promise<{ id: string; joinUrl: string; passcode: string | null }> {
  const scheduled = !!input.startTime;
  const m = await zoomApi<{ id: number; join_url: string; password?: string }>(accessToken, "/users/me/meetings", {
    method: "POST",
    body: JSON.stringify({
      topic: input.topic,
      type: scheduled ? 2 : 1,
      ...(scheduled ? { start_time: input.startTime, timezone: input.timezone } : {}),
      duration: input.durationMinutes,
      settings: { join_before_host: false, waiting_room: true, participant_video: false, host_video: true },
    }),
  });
  return { id: String(m.id), joinUrl: m.join_url, passcode: m.password ?? null };
}

export async function deleteZoomMeeting(accessToken: string, meetingId: string): Promise<void> {
  await zoomApi<void>(accessToken, `/meetings/${encodeURIComponent(meetingId)}`, { method: "DELETE" });
}

/** A short-lived key that lets the SDK start a meeting as the account's owner. */
export async function fetchZoomZak(accessToken: string): Promise<string> {
  return (await zoomApi<{ token: string }>(accessToken, "/users/me/token?type=zak")).token;
}
