import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const PLAN_SELECT = "*, creator:profiles!plans_created_by_fkey(first_name, last_name)";

export const getPlans = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select(PLAN_SELECT)
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("target_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return data ?? [];
});
