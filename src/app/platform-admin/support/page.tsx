import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllSupportTickets } from "@/lib/platform-admin/dal";
import { TICKET_CATEGORY_LABELS, TICKET_URGENCY_LABELS } from "@/lib/support/validation";
import { SupportTicketActions } from "@/components/platform-admin/SupportTicketActions";
import { SupportTicketThread } from "@/components/platform-admin/SupportTicketThread";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SupportTicketCategory, SupportTicketUrgency, SupportTicketStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Support | KingdomFlow Super Admin",
};

const STATUS_VARIANTS: Record<SupportTicketStatus, "default" | "secondary" | "destructive" | "outline"> = {
  open: "destructive",
  in_progress: "default",
  resolved: "secondary",
  closed: "outline",
};

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default async function PlatformAdminSupportPage() {
  await requirePlatformAdmin();
  const tickets = await getAllSupportTickets();
  const openCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Support</h1>
        <p className="mt-1 text-muted-foreground">
          Every ticket raised across every church — {openCount} open or in progress out of {tickets.length} total.
        </p>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No support tickets have been raised yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-base font-bold">{ticket.subject}</h3>
                      <Badge variant={STATUS_VARIANTS[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
                      <Badge variant="outline">{TICKET_CATEGORY_LABELS[ticket.category as SupportTicketCategory]}</Badge>
                      <Badge variant="secondary">{TICKET_URGENCY_LABELS[ticket.urgency as SupportTicketUrgency]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticket.organizationName} · {ticket.createdByName ?? "Unknown"} {ticket.createdByEmail && `(${ticket.createdByEmail})`} ·{" "}
                      {new Date(ticket.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <SupportTicketActions ticketId={ticket.id} status={ticket.status} />
                </div>
                <p className="text-sm text-muted-foreground">{ticket.description}</p>
                <SupportTicketThread ticketId={ticket.id} messages={ticket.messages} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
