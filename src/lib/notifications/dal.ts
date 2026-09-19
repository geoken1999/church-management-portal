import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getNotifications = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);

  return data ?? [];
});
