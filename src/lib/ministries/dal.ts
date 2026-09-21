import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getMinistries = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ministries")
    .select("*, members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});
