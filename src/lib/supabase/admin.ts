import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Bypasses RLS entirely — use ONLY for trusted, non-user-facing server
// machinery that has no Supabase session to act under (e.g. a Vercel Cron
// job refreshing tokens across every organization). Never import this from
// a route or action that handles a request on behalf of a specific signed-in
// user; use lib/supabase/server.ts (which respects RLS via their session)
// for that instead.
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (see .env.example) — " +
        "found in Supabase Project Settings -> API. Required for server-only jobs " +
        "like the Instagram token-refresh cron.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
