import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getEventRegistrations = cache(async (eventId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_registrations")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return data ?? [];
});
