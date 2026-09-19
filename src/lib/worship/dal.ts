import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getWorshipTeamMembers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("worship_team_members")
    .select("*, members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});

export const getWorshipDocuments = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("worship_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return data ?? [];
});
