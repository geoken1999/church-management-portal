import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTicket, getTickets } from "@/lib/tickets/dal";
import {
  TICKET_AREAS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  ticketKey,
  type TicketStatus,
} from "@/lib/tickets/constants";
import {
  resolvedAtFor,
  validateTicket,
  type TicketInput,
} from "@/lib/tickets/validation";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : "";

// GET: the tickets (?status=, ?type=, ?q=) with the count per status and the choices the app offers; with ?id=
// one ticket and its comments.
export const GET = (request: Request) =>
  withAdminScope(request, "tickets", async () => {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id))
        return fail("That ticket could not be found.", 404);
      const found = await getTicket(id);
      if (!found) return fail("That ticket could not be found.", 404);
      return NextResponse.json({
        ok: true,
        key: ticketKey(found.ticket.number),
        ...found,
      });
    }
    const { tickets, counts } = await getTickets({
      status: params.get("status") ?? undefined,
      type: params.get("type") ?? undefined,
      q: params.get("q") ?? undefined,
    });
    return NextResponse.json({
      ok: true,
      tickets: tickets
        .slice(0, 200)
        .map((t) => ({ ...t, key: ticketKey(t.number) })),
      counts,
      choices: {
        types: TICKET_TYPES,
        statuses: TICKET_STATUSES,
        priorities: TICKET_PRIORITIES,
        areas: TICKET_AREAS,
      },
    });
  });

// POST {action: "create", ...fields} makes a ticket; {action: "comment", id, body} adds a comment.
export const POST = (request: Request) =>
  withAdminScope(request, "tickets", async (caller) => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid request.");
    }
    const admin = createAdminClient();

    if (body.action === "comment") {
      const id = text(body.id, 40);
      const comment = text(body.body, 4001).trim();
      if (!/^[0-9a-f-]{36}$/i.test(id))
        return fail("That ticket could not be found.", 404);
      if (comment.length < 1) return fail("Write a comment first.");
      if (comment.length > 4000)
        return fail("Keep the comment under 4000 characters.");
      const { error } = await admin
        .from("change_ticket_comments")
        .insert({
          ticket_id: id,
          author: caller.name || caller.email,
          body: comment,
        });
      return error
        ? fail("Couldn't add the comment. Please try again.", 500)
        : NextResponse.json({ ok: true });
    }

    if (body.action === "create") {
      const input: TicketInput = {
        type: text(body.type, 30) || "task",
        title: text(body.title, 400),
        description: text(body.description, 8001),
        status: "open",
        priority: text(body.priority, 20) || "medium",
        area: text(body.area, 50) || "general",
        assignee: text(body.assignee, 200),
        release: "",
        references: "",
      };
      const errors = validateTicket(input);
      const first = Object.values(errors)[0];
      if (first) return fail(first);
      const { data, error } = await admin
        .from("change_tickets")
        .insert({
          type: input.type as "bug",
          title: input.title.trim(),
          description: input.description.trim() || null,
          status: "open",
          priority: input.priority as "medium",
          area: input.area.trim(),
          assignee: input.assignee.trim() || null,
          reported_by: caller.email,
        })
        .select("id, number")
        .single();
      if (error || !data)
        return fail("Couldn't create the ticket. Please try again.", 500);
      return NextResponse.json({
        ok: true,
        id: data.id,
        key: ticketKey(data.number),
      });
    }
    return fail("Invalid request.");
  });

// PATCH {id, status?, priority?, assignee?, release?} changes a ticket without resending all of it.
export const PATCH = (request: Request) =>
  withAdminScope(request, "tickets", async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid request.");
    }
    const id = text(body.id, 40);
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return fail("That ticket could not be found.", 404);
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("change_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!before) return fail("That ticket could not be found.", 404);

    const merged: TicketInput = {
      type: before.type,
      title: before.title,
      description: before.description ?? "",
      status: typeof body.status === "string" ? body.status : before.status,
      priority:
        typeof body.priority === "string" ? body.priority : before.priority,
      area: before.area,
      assignee:
        typeof body.assignee === "string"
          ? body.assignee
          : (before.assignee ?? ""),
      release:
        typeof body.release === "string"
          ? body.release
          : (before.release ?? ""),
      references: before.references_text ?? "",
    };
    const errors = validateTicket(merged);
    const first = Object.values(errors)[0];
    if (first) return fail(first);
    const { error } = await admin
      .from("change_tickets")
      .update({
        status: merged.status as TicketStatus,
        priority: merged.priority as "medium",
        assignee: merged.assignee.trim() || null,
        release: merged.release.trim() || null,
        resolved_at: resolvedAtFor(
          before.status as TicketStatus,
          merged.status as TicketStatus,
          before.resolved_at,
          new Date(),
        ),
      })
      .eq("id", id);
    return error
      ? fail("Couldn't save the ticket. Please try again.", 500)
      : NextResponse.json({ ok: true });
  });
