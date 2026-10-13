"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { validateSupportTicket, TICKET_URGENCIES } from "@/lib/support/validation";
import { notifyPlatformAdmins } from "@/lib/platform-admin/notify";
import { imageFilesFrom, removeSupportFiles, saveSupportImages } from "@/lib/support/attachments";
import type { SupportAttachment } from "@/lib/support/images";
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

  // Screenshots, if any, are saved first so the ticket and its pictures stay together.
  const membership = await requireOrganization();
  let attachments: SupportAttachment[] = [];
  const images = imageFilesFrom(formData);
  if (images.length > 0) {
    const saved = await saveSupportImages(membership.organization.id, images);
    if ("error" in saved) return { error: saved.error };
    attachments = saved.attachments.map(({ path, name, size }) => ({ path, name, size }));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").insert({
    organization_id: organizationId,
    created_by: user.id,
    subject: subject.trim(),
    description: description.trim(),
    category: category as SupportTicketCategory,
    urgency,
    attachments,
  });

  if (error) {
    await removeSupportFiles(attachments.map((a) => a.path));
    return { error: "Couldn't raise that ticket. Please try again." };
  }

  await notifyPlatformAdmins(
    `New support ticket: ${subject.trim()}`,
    `<p><strong>${membership.organization.name}</strong> raised a new ${category} ticket (${urgency} urgency).</p><p>${description.trim()}</p>${attachments.length > 0 ? `<p>${attachments.length} screenshot${attachments.length === 1 ? "" : "s"} attached. Open Super Admin → Support to see ${attachments.length === 1 ? "it" : "them"}.</p>` : ""}`,
  );

  revalidatePath(SUPPORT_PATH);
  return { success: true };
}

export async function deleteSupportTicket(formData: FormData) {
  await requireUser();
  const ticketId = String(formData.get("ticketId") ?? "");

  const supabase = await createClient();
  // The screenshots on the ticket and its replies go with it (read before deleting; RLS limits what is readable).
  const [{ data: ticket }, { data: replies }] = await Promise.all([
    supabase.from("support_tickets").select("attachments").eq("id", ticketId).maybeSingle(),
    supabase.from("support_ticket_messages").select("attachments").eq("ticket_id", ticketId),
  ]);
  const files = [...(ticket?.attachments ?? []), ...(replies ?? []).flatMap((r) => r.attachments ?? [])].map((a) => a.path);
  // RLS restricts this to the ticket's creator or an admin — a request
  // from anyone else simply deletes nothing rather than erroring.
  const { error } = await supabase.from("support_tickets").delete().eq("id", ticketId);
  if (!error) await removeSupportFiles(files);

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
  const images = imageFilesFrom(formData);
  const typed = String(formData.get("body") ?? "").trim();

  if (!typed && images.length === 0) {
    return { error: "Write a message or add a screenshot before sending." };
  }
  // A reply that is only a picture still needs some text in the thread.
  const body = typed || (images.length === 1 ? "(Screenshot attached)" : `(${images.length} screenshots attached)`);

  const membership = await requireOrganization();
  let attachments: SupportAttachment[] = [];
  if (images.length > 0) {
    const saved = await saveSupportImages(membership.organization.id, images);
    if ("error" in saved) return { error: saved.error };
    attachments = saved.attachments.map(({ path, name, size }) => ({ path, name, size }));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    organization_id: organizationId,
    author_type: "org",
    author_id: user.id,
    body,
    attachments,
  });

  if (error) {
    await removeSupportFiles(attachments.map((a) => a.path));
    return { error: "Couldn't send that reply. Please try again." };
  }

  await notifyPlatformAdmins(
    `New reply on a support ticket from ${membership.organization.name}`,
    `<p>${body}</p>${attachments.length > 0 ? `<p>${attachments.length} screenshot${attachments.length === 1 ? "" : "s"} attached. Open Super Admin → Support to see ${attachments.length === 1 ? "it" : "them"}.</p>` : ""}`,
  );

  revalidatePath(SUPPORT_PATH);
  return { success: true };
}
