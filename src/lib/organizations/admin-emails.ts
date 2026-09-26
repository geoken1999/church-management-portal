import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Every system email that's about the organization as a whole (billing,
// support ticket replies) rather than about one specific person goes to
// whoever can actually act on it — owner + admins, not every member. Uses
// the admin client since callers include webhooks and platform-admin
// actions with no org-scoped user session to run an RLS query as.
export async function getOrgAdminEmails(organizationId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_members")
    .select("profiles!inner(email)")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"]);

  return (data ?? [])
    .map((row) => (row.profiles as { email: string } | null)?.email)
    .filter((email): email is string => Boolean(email));
}
