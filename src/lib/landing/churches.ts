import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ListedChurch } from "@/lib/landing/display";

// The churches a platform admin has switched on for the landing page (organizations.landing_listed). Only the name,
// logo and country are read, and only for those churches. Before migration 0208 is applied nothing is listed.
export async function getListedChurches(limit = 24): Promise<ListedChurch[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("organizations")
      .select("id, name, logo_url, country")
      .eq("landing_listed", true)
      .order("name")
      .limit(limit);
    if (error || !data) return [];
    return data.map((o) => ({
      id: o.id,
      name: o.name,
      logoUrl: o.logo_url,
      country: o.country,
    }));
  } catch {
    return [];
  }
}
