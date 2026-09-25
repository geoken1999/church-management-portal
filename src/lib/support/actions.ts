"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { validateSupportTicket, TICKET_URGENCIES } from "@/lib/support/validation";
import { notifyPlatformAdmins } from "@/lib/platform-admin/notify";
import type { SupportTicketCategory, SupportTicketUrgency, SupportTicketStatus } from "@/types/database";

const SUPPORT_PATH = "/dashboard/support";
const SELF_SERVICE_STATUSES: SupportTicketStatus[] = ["open", "closed"];

export interface SupportTicketFormState {
  error?: string;
  fieldErrors?: ReturnType<typeof validateSupportTicket>;
  success?: boolean;
}

export async function createSupportTicket(
  _prevState: SupportTicketFormState,
  formData: FormData,
): Promise<SupportTicketFormState> {
  const user = await requireUser();

  const organizationId = String(formData.get("organizationId") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const description = String(formData.get("description") ?? "");
  const category = String(formData.get("category") ?? "");
  const urgencyRaw = String(formData.get("urgency") ?? "medium");
  const urgency: SupportTicketUrgency = (TICKET_URGENCIES as readonly string[]).includes(urgencyRaw)
    ? (urgencyRaw as SupportTicketUrgency)
    : "medium";

  const fieldErrors = validateSupportTicket({ subject, description, category });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").insert({
    organization_id: organizationId,
    created_by: user.id,
    subject: subject.trim(),
    description: description.trim(),
    category: category as SupportTicketCategory,
    urgency,
  });

  if (error) {
    return { error: "Couldn't raise that ticket. Please try again." };
  }

  const membership = await requireOrganization();
  await notifyPlatformAdmins(
    `New support ticket: ${subject.trim()}`,
    `<p><strong>${membership.organization.name}</strong> raised a new ${category} ticket (${urgency} urgency).</p><p>${description.trim()}</p>`,
  );

  revalidatePath(SUPPORT_PATH);
  return { success: true };
}

export async function deleteSupportTicket(formData: FormData) {
  await requireUser();
  const ticketId = String(formData.get("ticketId") ?? "");

  const supabase = await createClient();
  // RLS restricts this to the ticket's creator or an admin — a request
  // from anyone else simply deletes nothing rather than erroring.
  await supabase.from("support_tickets").delete().eq("id", ticketId);

  revalidatePath(SUPPORT_PATH);
}

// Self-service only — RLS (migration 0064) restricts the resulting status
// to 'open'/'closed' regardless of what's sent here, so a member can close
// their own resolved-in-practice ticket or reopen one, but can't claim
// 'in_progress'/'resolved' themselves (that's set from the Super Admin
// side once real triage has happened).
export async function setSupportTicketStatus(formData: FormData) {
  await requireUser();
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!SELF_SERVICE_STATUSES.includes(status as SupportTicketStatus)) return;

  const supabase = await createClient();
  await supabase.from("support_tickets").update({ status: status as SupportTicketStatus }).eq("id", ticketId);

  revalidatePath(SUPPORT_PATH);
}

export interface SupportTicketMessageState {
  error?: string;
  success?: boolean;
}

export async function addSupportTicketMessage(
  _prevState: SupportTicketMessageState,
  formData: FormData,
): Promise<SupportTicketMessageState> {
  const user = await requireUser();
  const ticketId = String(formData.get("ticketId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Write a message before sending." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    organization_id: organizationId,
    author_type: "org",
    author_id: user.id,
    body,
  });

  if (error) {
    return { error: "Couldn't send that reply. Please try again." };
  }

  const membership = await requireOrganization();
  await notifyPlatformAdmins(
    `New reply on a support ticket from ${membership.organization.name}`,
    `<p>${body}</p>`,
  );

  revalidatePath(SUPPORT_PATH);
  return { success: true };
}
