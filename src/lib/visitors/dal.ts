import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { passState, type PassState } from "@/lib/visitors/pass";
import type { Visitor } from "@/types/database";

// The church's visitors, newest first. Read with the signed-in person's own session (row-level security lets
// only the church's team see them). The public feedback token is never sent to the browser.
export type VisitorRow = Omit<Visitor, "feedback_token" | "phone_key" | "organization_id"> & {
  // The latest entrance pass: whether it can still be used, and whether its WhatsApp message went.
  pass: { code: string; state: PassState; whatsappSent: boolean; whatsappNote: string | null } | null;
};

export const getVisitors = cache(async (organizationId: string): Promise<VisitorRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visitors")
    .select("id, name, phone, email, prayer_request, first_visited_on, last_visited_on, visit_count, feedback_sent_at, feedback_note, rating, feedback_text, wants_followup, feedback_at, followed_up_at, created_at")
    .eq("organization_id", organizationId)
    .order("first_visited_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  const rows = (data ?? []) as Omit<VisitorRow, "pass">[];
  const { data: passes } = rows.length
    ? await supabase
        .from("visitor_passes")
        .select("visitor_id, code, valid_until, entered_at, whatsapp_sent_at, whatsapp_note, visit_date")
        .eq("organization_id", organizationId)
        .in("visitor_id", rows.map((r) => r.id))
        .order("visit_date", { ascending: false })
    : { data: [] };
  const latest = new Map<string, NonNullable<typeof passes>[number]>();
  for (const p of passes ?? []) if (!latest.has(p.visitor_id)) latest.set(p.visitor_id, p);
  return rows.map((r) => {
    const p = latest.get(r.id);
    return { ...r, pass: p ? { code: p.code, state: passState(p), whatsappSent: Boolean(p.whatsapp_sent_at), whatsappNote: p.whatsapp_note } : null };
  });
});
