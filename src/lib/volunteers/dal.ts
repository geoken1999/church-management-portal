import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getVolunteers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("volunteers")
    .select("*, members(id, first_name, last_name, phone)")
    .eq("organization_id", organizationId)
    .order("volunteer_no", { ascending: true });
  return data ?? [];
});
