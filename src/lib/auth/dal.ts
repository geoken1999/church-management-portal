import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

// Memoized per request: safe to call from multiple Server Components in the
// same render without issuing duplicate requests to Supabase.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  return data;
});

// Use in Server Components/pages that require an authenticated session.
// proxy.ts already redirects unauthenticated requests away from /dashboard;
// this is the secure, non-optimistic check close to the data itself.
export async function requireUser() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
