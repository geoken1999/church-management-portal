import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getTickets } from "@/lib/tickets/dal";
import {
  TICKET_AREAS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  label,
  ticketKey,
} from "@/lib/tickets/constants";
import {
  TicketForm,
  EMPTY_TICKET,
} from "@/components/platform-admin/TicketForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Tickets | KingdomFlow Super Admin",
};
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "destructive",
  in_progress: "default",
  in_review: "default",
  done: "secondary",
  closed: "outline",
  wont_do: "outline",
};

function href(params: Record<string, string | undefined>) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return `/platform-admin/tickets${query ? `?${query}` : ""}`;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    area?: string;
    q?: string;
    new?: string;
  }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const { tickets, counts } = await getTickets(params);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const active =
    (counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.in_review ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Tickets
        </h1>
        <p className="mt-1 text-muted-foreground">
          Every bug fix, feature and change request, with its status. {active}{" "}
          active out of {total}. Raise a change request below for anything you
          want done; it stays here as the record.
        </p>
      </div>

      <details
        open={params.new === "1"}
        className="rounded-xl border border-border bg-card p-4"
      >
        <summary className="cursor-pointer text-sm font-medium">
          Raise a new ticket or change request
        </summary>
        <div className="mt-4">
          <TicketForm initial={EMPTY_TICKET} submitLabel="Create ticket" />
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <Link
          href={href({ ...params, status: undefined })}
          className={`rounded-full border px-3 py-1 text-sm ${!params.status ? "border-primary bg-primary/10" : "border-border"}`}
        >
          All ({total})
        </Link>
        {TICKET_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={href({ ...params, status: s.value })}
            className={`rounded-full border px-3 py-1 text-sm ${params.status === s.value ? "border-primary bg-primary/10" : "border-border"}`}
          >
            {s.label} ({counts[s.value] ?? 0})
          </Link>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        action="/platform-admin/tickets"
      >
        {params.status && (
          <input type="hidden" name="status" value={params.status} />
        )}
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search title, description or KF-12"
          className="h-9 w-64 rounded-lg border border-input bg-transparent px-3 text-sm"
        />
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All types</option>
          {TICKET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          name="area"
          defaultValue={params.area ?? ""}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All areas</option>
          {TICKET_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-border px-3 text-sm"
        >
          Filter
        </button>
      </form>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tickets match.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/platform-admin/tickets/${t.id}`}
              className="block"
            >
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className="mr-2 text-muted-foreground">
                        {ticketKey(t.number)}
                      </span>
                      {t.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {label(TICKET_TYPES, t.type)} · {t.area} ·{" "}
                      {label(TICKET_PRIORITIES, t.priority)} priority
                      {t.assignee ? ` · ${t.assignee}` : ""}
                      {t.release ? ` · ${t.release}` : ""} ·{" "}
                      {new Date(t.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>
                    {label(TICKET_STATUSES, t.status)}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
