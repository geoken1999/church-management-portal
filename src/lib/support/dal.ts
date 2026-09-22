import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getSupportTickets = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_tickets")
    .select("*, profiles(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return data ?? [];
});
