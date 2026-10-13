import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/support/attachments";

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

  const signedTickets = await withSignedUrls(tickets ?? []);
  const signedMessages = await withSignedUrls(messages ?? []);

  const messagesByTicket = new Map<string, typeof signedMessages>();
  for (const message of signedMessages) {
    const list = messagesByTicket.get(message.ticket_id) ?? [];
    list.push(message);
    messagesByTicket.set(message.ticket_id, list);
  }

  return signedTickets.map((ticket) => ({
    ...ticket,
    messages: messagesByTicket.get(ticket.id) ?? [],
  }));
});
