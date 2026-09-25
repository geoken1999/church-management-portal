import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Two queries grouped in JS rather than a nested select — same shape as
// getForms/getFormResponses (src/lib/forms/dal.ts) — so each ticket's
// message thread is just a plain array on the row the UI already expects.
export const getSupportTickets = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const [{ data: tickets }, { data: messages }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("*, profiles(first_name, last_name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("support_ticket_messages")
      .select("*, profiles(first_name, last_name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);

  const messagesByTicket = new Map<string, NonNullable<typeof messages>>();
  for (const message of messages ?? []) {
    const list = messagesByTicket.get(message.ticket_id) ?? [];
    list.push(message);
    messagesByTicket.set(message.ticket_id, list);
  }

  return (tickets ?? []).map((ticket) => ({
    ...ticket,
    messages: messagesByTicket.get(ticket.id) ?? [],
  }));
});
