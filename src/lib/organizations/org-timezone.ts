import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";

// The organization's own timezone, for working out "today" and month
// boundaries on the server. Reads the row directly, so it works from any
// server path, including the public ones.
export async function getOrganizationTimezone(organizationId: string): Promise<string> {
  const { data } = await createAdminClient().from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
  return data?.timezone ?? DEFAULT_TIMEZONE;
}
