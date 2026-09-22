import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getCommitteeMembers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("committee_members")
    .select("*, members(id, first_name, last_name, phone)")
    .eq("organization_id", organizationId)
    .order("committee_name", { ascending: true });

  return data ?? [];
});
