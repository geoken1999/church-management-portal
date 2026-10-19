import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ChangeTicket, ChangeTicketComment } from "@/types/database";

export interface TicketFilters {
  status?: string;
  type?: string;
  area?: string;
  q?: string;
}

// Super Admin only: the callers check requirePlatformAdmin first.
export async function getTickets(
  filters: TicketFilters,
): Promise<{ tickets: ChangeTicket[]; counts: Record<string, number> }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("change_tickets")
    .select("*")
    .order("number", { ascending: false })
    .limit(1000);
  const all = (data ?? []) as ChangeTicket[];
  const counts: Record<string, number> = {};
  for (const t of all) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const term = (filters.q ?? "").trim().toLowerCase();
  const tickets = all.filter(
    (t) =>
      (!filters.status || t.status === filters.status) &&
      (!filters.type || t.type === filters.type) &&
      (!filters.area || t.area === filters.area) &&
      (!term ||
        t.title.toLowerCase().includes(term) ||
        (t.description ?? "").toLowerCase().includes(term) ||
        `kf-${t.number}` === term ||
        String(t.number) === term),
  );
  return { tickets, counts };
}

export async function getTicket(
  id: string,
): Promise<{ ticket: ChangeTicket; comments: ChangeTicketComment[] } | null> {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("change_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return null;
  const { data: comments } = await admin
    .from("change_ticket_comments")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at");
  return {
    ticket: ticket as ChangeTicket,
    comments: (comments ?? []) as ChangeTicketComment[],
  };
}
