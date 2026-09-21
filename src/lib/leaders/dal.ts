import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getLeaders = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leaders")
    .select("*, members(id, first_name, last_name, phone)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});

// Slim shape consumed by the Ministries/Branches/Events "managed by"
// pickers — same MemberBasic shape those already expect from
// getMembers(), just restricted to members who are also designated
// leaders. Media and Worship deliberately keep drawing from the full
// members list instead of this.
export const getLeaderMembers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leaders")
    .select("members(id, first_name, last_name)")
    .eq("organization_id", organizationId);

  return (data ?? [])
    .map((row) => row.members)
    .filter((member): member is { id: string; first_name: string; last_name: string } => Boolean(member));
});
