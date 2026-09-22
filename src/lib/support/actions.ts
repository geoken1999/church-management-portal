"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { validateSupportTicket, TICKET_URGENCIES } from "@/lib/support/validation";
import type { SupportTicketCategory, SupportTicketUrgency } from "@/types/database";

const SUPPORT_PATH = "/dashboard/support";

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
