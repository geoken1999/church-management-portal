import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// One query for the families, one for every member assignment across all
// of them, joined in JS — same two-query-then-group shape as
// getForms/getFormResponses (src/lib/forms/dal.ts) rather than a nested
// Supabase select, so each family's member list is just a plain array on
// the row the UI already expects.
export const getFamilies = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const [{ data: families }, { data: members }] = await Promise.all([
    supabase.from("families").select("*").eq("organization_id", organizationId).order("name", { ascending: true }),
    supabase
      .from("family_members")
      .select("*, members(id, first_name, last_name, phone)")
      .eq("organization_id", organizationId),
  ]);

  const membersByFamily = new Map<string, NonNullable<typeof members>>();
  for (const row of members ?? []) {
    const list = membersByFamily.get(row.family_id) ?? [];
    list.push(row);
    membersByFamily.set(row.family_id, list);
  }

  return (families ?? []).map((family) => ({
    ...family,
    members: membersByFamily.get(family.id) ?? [],
  }));
});
