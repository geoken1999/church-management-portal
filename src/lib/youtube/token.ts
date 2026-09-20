import "server-only";

import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken } from "@/lib/youtube/client";
import type { YouTubeConnection } from "@/types/database";

// Google's access tokens are short-lived (~1 hour), unlike Instagram's
// 60-day tokens — a wider refresh window here would just mean refreshing
// almost every request. Lazy refresh alone is sufficient; there's no
// separate cron for YouTube since the refresh_token itself doesn't expire
// on a schedule the way Instagram's long-lived token does.
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export async function getValidAccessToken(connection: YouTubeConnection): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > REFRESH_THRESHOLD_MS) {
    return connection.access_token;
  }

  const refreshed = await refreshAccessToken(connection.refresh_token);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();

  const supabase = await createClient();
  await supabase
    .from("youtube_connections")
    .update({ access_token: refreshed.accessToken, token_expires_at: tokenExpiresAt })
    .eq("id", connection.id);

  return refreshed.accessToken;
}
