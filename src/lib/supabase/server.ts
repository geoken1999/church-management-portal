import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Creates a Supabase client for use in Server Components, Server Actions, and
// Route Handlers. Server Components can't set cookies (Next.js will throw),
// so the setAll call is wrapped in a try/catch — session refresh in that case
// is instead handled by proxy.ts on the next request.
export async function createClient() {
  // Read cookies first so Next.js registers this render as dynamic before
  // any error below (e.g. missing env vars) can short-circuit that signal
  // during static generation.
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — safe to ignore, proxy.ts
          // refreshes the session cookie on the next request instead.
        }
      },
    },
  });
}
