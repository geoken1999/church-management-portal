import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshLongLivedToken } from "@/lib/instagram/client";

// Vercel Cron hits this daily (see vercel.json) to refresh any Instagram
// long-lived token expiring within the next week — belt-and-suspenders
// alongside the lazy refresh in lib/instagram/token.ts, which only kicks in
// when an org's connection is actually being used. Runs with no user
// session (Vercel Cron, not a signed-in request), so it needs the
// RLS-bypassing admin client — every org's connections have to be
// readable here, not just one caller's.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connections, error } = await supabase
    .from("instagram_connections")
    .select("id, access_token")
    .lt("token_expires_at", soon);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let refreshed = 0;
  let failed = 0;

  for (const connection of connections ?? []) {
    try {
      const result = await refreshLongLivedToken(connection.access_token);
      const tokenExpiresAt = new Date(Date.now() + result.expiresInSeconds * 1000).toISOString();
      await supabase
        .from("instagram_connections")
        .update({ access_token: result.accessToken, token_expires_at: tokenExpiresAt })
        .eq("id", connection.id);
      refreshed += 1;
    } catch {
      // A token that's already expired can't be refreshed at all — the
      // connection is dead and the org will see "reconnect" in the UI.
      // Nothing to roll back; just count it and move on.
      failed += 1;
    }
  }

  return NextResponse.json({ refreshed, failed, checked: connections?.length ?? 0 });
}
