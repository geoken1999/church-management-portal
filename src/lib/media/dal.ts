import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getMediaTeamMembers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_team_members")
    .select("*, members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});

export const getMediaEquipment = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_equipment")
    .select("*, members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});

export const getMediaSocialAccounts = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_social_accounts")
    .select("*, members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});
