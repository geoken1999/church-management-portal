import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AuraMessage } from "@/types/database";

// Each team member's conversation with Aura is their own — see migration
// 0095's per-user RLS policy — so this is scoped by both organizationId and
// the current session's user, not just the org.
export const getAuraMessages = cache(async (organizationId: string, authUserId: string): Promise<AuraMessage[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("aura_messages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .order("created_at", { ascending: true });

  return data ?? [];
});
