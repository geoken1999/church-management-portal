import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientForToken } from "@/lib/supabase/as-user";
import { requireMobileTeamMember } from "@/lib/mobile/staff-auth";
import { validateSupportTicket, TICKET_URGENCIES } from "@/lib/support/validation";
import { notifyPlatformAdmins } from "@/lib/platform-admin/notify";
import type { SupportTicketCategory, SupportTicketUrgency } from "@/types/database";

// The staff mobile app's Support: raise a ticket and reply on one. The writes run
// as the person (Row Level Security applies, exactly as on the web) and the
// KingdomFlow team is emailed, as the web does. Closing, reopening and deleting a
// ticket go straight through the app's own session.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  const organizationId = text("organizationId");
  const auth = await requireMobileTeamMember(request, organizationId);
  if (auth instanceof NextResponse) return auth;

  const db = createClientForToken(auth.token);
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const orgName = org?.name ?? "A church";

  if (text("action") === "create") {
    const subject = text("subject");
    const description = text("description");
    const category = text("category");
    const urgency: SupportTicketUrgency = (TICKET_URGENCIES as readonly string[]).includes(text("urgency")) ? (text("urgency") as SupportTicketUrgency) : "medium";

    const errors = validateSupportTicket({ subject, description, category });
    const firstError = errors.subject ?? errors.description ?? errors.category;
    if (firstError) return NextResponse.json({ ok: false, error: firstError });

    const { error } = await db.from("support_tickets").insert({
      organization_id: organizationId,
      created_by: auth.userId,
      subject: subject.trim(),
      description: description.trim(),
      category: category as SupportTicketCategory,
      urgency,
    });
    if (error) return NextResponse.json({ ok: false, error: "Couldn't raise that ticket. Please try again." });

    await notifyPlatformAdmins(
      `New support ticket: ${subject.trim()}`,
      `<p><strong>${orgName}</strong> raised a new ${category} ticket (${urgency} urgency).</p><p>${description.trim()}</p>`,
    );
    return NextResponse.json({ ok: true });
  }

  if (text("action") === "reply") {
    const reply = text("body").trim();
    const ticketId = text("ticketId");
    if (!reply) return NextResponse.json({ ok: false, error: "Write a message before sending." });
    if (!ticketId) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

    const { error } = await db.from("support_ticket_messages").insert({ ticket_id: ticketId, organization_id: organizationId, author_type: "org", author_id: auth.userId, body: reply });
    if (error) return NextResponse.json({ ok: false, error: "Couldn't send that reply. Please try again." });

    await notifyPlatformAdmins(`New reply on a support ticket from ${orgName}`, `<p>${reply}</p>`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}
