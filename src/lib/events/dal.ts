import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getEvents = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, members(id, first_name, last_name), branches(id, name)")
    .eq("organization_id", organizationId)
    .order("start_at", { ascending: true });

  return data ?? [];
});
