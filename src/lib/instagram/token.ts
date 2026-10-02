import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { refreshLongLivedToken } from "@/lib/instagram/client";
import type { InstagramConnection } from "@/types/database";

const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

// Lazily refreshes the token if it's within 3 days of expiring, on top of
// the daily cron sweep (src/app/api/instagram/cron/refresh-tokens) — this
// covers an account that's actively being used between cron runs, and the
// cron covers one that isn't being viewed at all. Uses the admin client
// rather than the request-scoped one: this write is internal cache
// bookkeeping, not a user-permission-gated action, and this function is
// also called from the webhook route, which has no user session to scope
// an RLS-governed client to at all.
export async function getValidAccessToken(connection: InstagramConnection): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > REFRESH_THRESHOLD_MS) {
    return connection.access_token;
  }

  const refreshed = await refreshLongLivedToken(connection.access_token);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();

  const supabase = createAdminClient();
  await supabase
    .from("instagram_connections")
    .update({ access_token: refreshed.accessToken, token_expires_at: tokenExpiresAt })
    .eq("id", connection.id);

  return refreshed.accessToken;
}
