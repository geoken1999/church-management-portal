import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getOrganizationSubscription = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});
