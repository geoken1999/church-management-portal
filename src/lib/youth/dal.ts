import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getYouths = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("youths")
    .select("*, members(id, first_name, last_name, phone, date_of_birth)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});
