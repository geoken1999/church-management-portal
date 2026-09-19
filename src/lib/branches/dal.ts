import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getBranches = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});
