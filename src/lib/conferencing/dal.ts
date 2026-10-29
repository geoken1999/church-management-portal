import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { openSecret, sealSecret } from "@/lib/security/connection-secrets";
import { refreshZoomToken } from "@/lib/conferencing/zoom";
import { refreshMeetToken } from "@/lib/conferencing/google-meet";
import type { ConferenceConnection, ConferenceMeeting, ConferenceProvider } from "@/types/database";

const REFRESH_WITHIN_MS = 5 * 60 * 1000;

export async function getConnection(organizationId: string, provider: ConferenceProvider): Promise<ConferenceConnection | null> {
  const { data } = await createAdminClient().from("conference_connections").select("*").eq("organization_id", organizationId).eq("provider", provider).maybeSingle();
  return data ?? null;
}

/** What the page may show about a connection: never the tokens. */
export async function getConnectionSummary(organizationId: string, provider: ConferenceProvider): Promise<{ email: string | null; name: string | null } | null> {
  const c = await getConnection(organizationId, provider);
  return c ? { email: c.account_email, name: c.account_name } : null;
}

/** A working access token for the church's account, refreshed (and the new tokens saved) when it is about to expire. */
export async function getAccessToken(connection: ConferenceConnection): Promise<string> {
  if (new Date(connection.token_expires_at).getTime() - Date.now() > REFRESH_WITHIN_MS) return openSecret(connection.access_token);
  const refreshed = connection.provider === "zoom" ? await refreshZoomToken(openSecret(connection.refresh_token)) : await refreshMeetToken(openSecret(connection.refresh_token));
  await createAdminClient()
    .from("conference_connections")
    .update({
      access_token: sealSecret(refreshed.accessToken),
      // Zoom replaces the refresh token on every refresh; Google keeps the one it gave.
      ...(refreshed.refreshToken ? { refresh_token: sealSecret(refreshed.refreshToken) } : {}),
      token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
    })
    .eq("id", connection.id);
  return refreshed.accessToken;
}

export async function getConferenceMeetings(organizationId: string): Promise<ConferenceMeeting[]> {
  const { data } = await createAdminClient().from("conference_meetings").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
  return data ?? [];
}

export async function getConferenceMeeting(organizationId: string, id: string): Promise<ConferenceMeeting | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from("conference_meetings").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  return data ?? null;
}
