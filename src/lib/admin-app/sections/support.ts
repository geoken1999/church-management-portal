import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAllSupportTickets } from "@/lib/platform-admin/dal";
import { getAllDeletionRequests } from "@/lib/account-deletion/dal";
import { processDeletionRequest } from "@/lib/account-deletion/process";
import { allowedDecisions, type DeletionDecision } from "@/lib/account-deletion/rules";
import { notifyOrgOfSupportReply } from "@/lib/support/notify-org";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { SupportTicketStatus } from "@/types/database";
import { fail, ok, when, type AdminSection } from "./common";

const STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

const support: AdminSection = {
  key: "support",
  scope: "support",
  title: "Support tickets",
  description: "Questions churches sent from their dashboard; reply and set status",
  icon: "support_agent",
  async load(filter) {
    const all = await getAllSupportTickets();
    const shown = filter && filter !== "all" ? all.filter((t) => t.status === filter) : all;
    return {
      title: "Support tickets",
      filter: {
        label: "Status",
        value: filter && STATUSES.includes(filter as SupportTicketStatus) ? filter : "all",
        options: [
          { value: "all", label: `All (${all.length})` },
          ...STATUSES.map((s) => ({
            value: s,
            label: `${s.replace("_", " ")} (${all.filter((t) => t.status === s).length})`,
          })),
        ],
      },
      groups: [
        {
          items: shown.map((t) => ({
            id: t.id,
            title: t.subject,
            subtitle: `${t.organizationName} · ${t.category} · ${when(t.createdAt)}`,
            badge: t.status.replace("_", " "),
            tone:
              t.status === "open" ? ("warn" as const) : t.status === "in_progress" ? ("info" as const) : ("good" as const),
            body: [
              t.description,
              ...t.messages.map((m) => `\n— ${m.authorType === "admin" ? "KingdomFlow" : (m.authorName ?? "Church")} · ${when(m.createdAt)}\n${m.body}`),
            ].join("\n"),
            fields: [
              { label: "Urgency", value: t.urgency },
              { label: "From", value: `${t.createdByName ?? "—"} ${t.createdByEmail ?? ""}`.trim() },
              { label: "Attachments", value: String(t.attachments.length) },
            ],
            actions: [
              {
                key: "reply",
                label: "Reply",
                inputs: [{ key: "body", label: "Your reply", kind: "multiline" as const, required: true }],
              },
              {
                key: "status",
                label: "Set status",
                inputs: [
                  {
                    key: "status",
                    label: "Status",
                    kind: "select" as const,
                    required: true,
                    initial: t.status,
                    options: STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") })),
                  },
                ],
              },
            ],
          })),
        },
      ],
      empty: "No support tickets.",
    };
  },
  async act(caller, action, id, input) {
    if (!id) return fail("Unknown ticket.");
    const admin = createAdminClient();
    if (action === "status") {
      if (!STATUSES.includes(input.status as SupportTicketStatus)) return fail("Choose a status.");
      await admin.from("support_tickets").update({ status: input.status as SupportTicketStatus }).eq("id", id);
      await logPlatformEvent({
        level: "info",
        source: "platform_admin",
        message: `Platform admin (${caller.email}) set support ticket status to ${input.status} (admin app)`,
        metadata: { ticketId: id },
      });
      return ok("Status saved.");
    }
    if (action === "reply") {
      const body = (input.body ?? "").trim();
      if (!body) return fail("Write a reply before sending.");
      const { data: ticket } = await admin
        .from("support_tickets")
        .select("organization_id, subject")
        .eq("id", id)
        .maybeSingle();
      if (!ticket) return fail("That ticket could not be found.");
      const { error } = await admin.from("support_ticket_messages").insert({
        ticket_id: id,
        organization_id: ticket.organization_id,
        author_type: "admin",
        body,
      });
      if (error) return fail("Couldn't send that reply. Please try again.");
      await admin.from("notifications").insert({
        organization_id: ticket.organization_id,
        type: "support_ticket_reply",
        title: "Support replied to your ticket",
        body: `Re: ${ticket.subject}`,
        link: "/dashboard/support",
      });
      await notifyOrgOfSupportReply({
        organizationId: ticket.organization_id,
        ticketSubject: ticket.subject,
        replyBody: body,
      });
      return ok("Reply sent.");
    }
    return fail("Unknown action.");
  },
};

const KIND = { member: "Member", team: "Team member", owner: "Church owner" } as const;

const deletions: AdminSection = {
  key: "deletions",
  scope: "support",
  title: "Deletion requests",
  description: "People who asked to delete their account",
  icon: "person_remove",
  async load() {
    const requests = await getAllDeletionRequests();
    const admin = createAdminClient();
    const { data: forms } = await admin
      .from("deletion_form_requests")
      .select("id, name, email, church_name, relationship, scope, details, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return {
      title: "Deletion requests",
      note: "A church owner's request can only be processed here. Deleting an account is permanent.",
      summary: [{ label: "Waiting", value: String(requests.filter((r) => r.status === "pending").length) }],
      groups: [
        {
          title: "From the app",
          items: requests.map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: `${KIND[r.kind]} · ${r.churchName ?? "—"} · ${when(r.requestedAt)}`,
            badge: r.status,
            tone: r.status === "pending" ? ("warn" as const) : r.status === "completed" ? ("good" as const) : undefined,
            body: r.reason ?? undefined,
            fields: [
              { label: "Contact", value: r.contact ?? "—" },
              { label: "Outcome", value: r.outcome ?? "—" },
            ],
            actions:
              r.status === "pending"
                ? [
                    ...(allowedDecisions(r.kind).includes("delete_account")
                      ? [{ key: "delete_account", label: "Delete account", danger: true, confirm: "Delete this account permanently?" }]
                      : []),
                    ...(allowedDecisions(r.kind).includes("delete_account_and_record")
                      ? [{ key: "delete_account_and_record", label: "Delete account and member record", danger: true, confirm: "Delete the account and the member's record permanently?" }]
                      : []),
                    {
                      key: "reject",
                      label: "Decline",
                      inputs: [{ key: "note", label: "Note (optional)", kind: "text" as const }],
                    },
                  ]
                : undefined,
          })),
        },
        {
          title: "From the web form",
          items: (forms ?? []).map((f) => ({
            id: `form-${f.id}`,
            title: f.name,
            subtitle: `${f.email} · ${f.church_name ?? "—"} · ${when(f.created_at)}`,
            badge: f.status,
            body: f.details ?? undefined,
            fields: [
              { label: "Relationship", value: f.relationship ?? "—" },
              { label: "Scope", value: f.scope ?? "—" },
            ],
            actions:
              f.status === "pending"
                ? [
                    {
                      key: "form_completed",
                      label: "Mark completed",
                      confirm: "Mark this request completed and email the person? Delete their data first.",
                      inputs: [{ key: "note", label: "Note for the person (optional)", kind: "text" as const }],
                    },
                    { key: "form_rejected", label: "Decline", danger: true, inputs: [{ key: "note", label: "Why (optional)", kind: "text" as const }] },
                  ]
                : undefined,
          })),
        },
      ].filter((g) => g.items.length > 0),
      empty: "No deletion requests.",
    };
  },
  async act(caller, action, id, input) {
    if (!id) return fail("Unknown request.");
    if (action === "form_completed" || action === "form_rejected") {
      if (!id.startsWith("form-")) return fail("Unknown request.");
      const formId = id.slice(5);
      const decision = action === "form_completed" ? "completed" : "rejected";
      const admin = createAdminClient();
      const { data: request } = await admin.from("deletion_form_requests").select("*").eq("id", formId).maybeSingle();
      if (!request) return fail("That request wasn't found.");
      if (request.status !== "pending") return fail("Only a confirmed, pending request can be processed.");
      const note = (input.note ?? "").trim().slice(0, 500);
      const { error } = await admin
        .from("deletion_form_requests")
        .update({ status: decision, outcome_note: note || null, processed_by: caller.userId, processed_at: new Date().toISOString() })
        .eq("id", formId);
      if (error) return fail("Couldn't update the request. Please try again.");
      if (isEmailConfigured()) {
        const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const done = decision === "completed";
        await sendBulkEmail({
          fromName: "KingdomFlow",
          subject: done ? "Your account deletion request is complete" : "About your account deletion request",
          html: `<div style="font-family:sans-serif;max-width:480px"><p>Hi ${esc(request.name)},</p><p>${
            done
              ? "Your account deletion request has been completed. Your sign-in and the data you asked us to remove have been deleted, apart from records we must keep by law (such as tax invoices)."
              : "We couldn't complete your deletion request."
          }</p>${note ? `<p>${esc(note)}</p>` : ""}<p>Questions? Reply to this email.</p></div>`,
          recipients: [request.email],
          replyTo: "admin@kingdomflow.in",
        });
      }
      await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Web deletion request ${decision} for ${request.email} by ${caller.email} (admin app)` });
      return ok("Done.");
    }
    if (!["delete_account", "delete_account_and_record", "reject"].includes(action))
      return fail("Unknown action.");
    const result = await processDeletionRequest({
      requestId: id,
      decision: action as DeletionDecision,
      note: input.note ?? "",
      processor: { authUserId: caller.userId, email: caller.email, isPlatformAdmin: true },
    });
    return result.error ? fail(result.error) : ok("Done.");
  },
};

export const supportSections = [support, deletions];
