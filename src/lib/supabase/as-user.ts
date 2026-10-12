import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// A client signed in as the person who holds [accessToken] (the staff mobile
// app's bearer token), so Row Level Security applies exactly as it does for
// that person on the web, instead of the all-seeing service role.
export function createClientForToken(accessToken: string) {
  const { url, anonKey } = getSupabaseEnv();
  return createSupabaseClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
