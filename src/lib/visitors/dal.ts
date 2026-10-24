import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Visitor } from "@/types/database";

// The church's visitors, newest first. Read with the signed-in person's own session (row-level security lets
// only the church's team see them). The public feedback token is never sent to the browser.
export type VisitorRow = Omit<Visitor, "feedback_token" | "phone_key" | "organization_id">;

export const getVisitors = cache(async (organizationId: string): Promise<VisitorRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visitors")
    .select("id, name, phone, email, prayer_request, first_visited_on, last_visited_on, visit_count, feedback_sent_at, feedback_note, rating, feedback_text, wants_followup, feedback_at, followed_up_at, created_at")
    .eq("organization_id", organizationId)
    .order("first_visited_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  return (data ?? []) as VisitorRow[];
});
