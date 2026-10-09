import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getMemberFieldDefinitions = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_field_definitions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  return data ?? [];
});

export const getMembers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("*, branches!members_branch_id_fkey(id, name)")
    .eq("organization_id", organizationId)
    .order("last_name", { ascending: true });

  return data ?? [];
});

// The member's CURRENT values come along embedded so the admin UI can
// show a before/after diff without a second round trip.
export const getPendingProfileUpdateRequests = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_profile_update_requests")
    .select("*, members(first_name, last_name, date_of_birth, marital_status, wedding_date)")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return data ?? [];
});
