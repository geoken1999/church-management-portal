import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getTicket } from "@/lib/tickets/dal";
import { ticketKey } from "@/lib/tickets/constants";
import { TicketForm } from "@/components/platform-admin/TicketForm";
import { TicketComments } from "@/components/platform-admin/TicketComments";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ticket | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getTicket(id);
  if (!found) notFound();
  const { ticket, comments } = found;

  return (
    <div className="space-y-6">
      <Link
        href="/platform-admin/tickets"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Tickets
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          <span className="mr-2 text-muted-foreground">
            {ticketKey(ticket.number)}
          </span>
          {ticket.title}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Raised {new Date(ticket.created_at).toLocaleString("en-IN")}
          {ticket.reported_by ? ` by ${ticket.reported_by}` : ""}
          {ticket.resolved_at
            ? ` · finished ${new Date(ticket.resolved_at).toLocaleString("en-IN")}`
            : ""}
        </p>
      </div>
      <Card>
        <CardContent>
          <TicketForm
            ticketId={ticket.id}
            submitLabel="Save changes"
            initial={{
              type: ticket.type,
              title: ticket.title,
              description: ticket.description ?? "",
              status: ticket.status,
              priority: ticket.priority,
              area: ticket.area,
              assignee: ticket.assignee ?? "",
              release: ticket.release ?? "",
              references: ticket.references_text ?? "",
            }}
          />
        </CardContent>
      </Card>
      <div className="space-y-2">
        <h2 className="font-heading text-lg font-bold">Comments</h2>
        <TicketComments ticketId={ticket.id} comments={comments} />
      </div>
    </div>
  );
}
