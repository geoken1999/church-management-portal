"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import {
  resolvedAtFor,
  validateTicket,
  type TicketErrors,
  type TicketInput,
} from "@/lib/tickets/validation";
import type { TicketStatus } from "@/lib/tickets/constants";

export interface TicketResult {
  error?: string;
  fieldErrors?: TicketErrors;
  id?: string;
  success?: boolean;
}

const PATH = "/platform-admin/tickets";

function row(input: TicketInput) {
  return {
    type: input.type as "bug",
    title: input.title.trim(),
    description: input.description.trim() || null,
    status: input.status as "open",
    priority: input.priority as "medium",
    area: input.area.trim(),
    assignee: input.assignee.trim() || null,
    release: input.release.trim() || null,
    references_text: input.references.trim() || null,
  };
}

export async function createTicketAction(
  input: TicketInput,
): Promise<TicketResult> {
  const user = await requirePlatformAdmin();
  const fieldErrors = validateTicket(input);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  const { data, error } = await createAdminClient()
    .from("change_tickets")
    .insert({
      ...row(input),
      reported_by: user.email ?? "Platform team",
      resolved_at: resolvedAtFor(
        null,
        input.status as TicketStatus,
        null,
        new Date(),
      ),
    })
    .select("id")
    .single();
  if (error || !data)
    return {
      error:
        "Couldn't create the ticket. Check that the tickets migration has been applied.",
    };
  revalidatePath(PATH);
  return { success: true, id: data.id };
}

export async function updateTicketAction(
  id: string,
  input: TicketInput,
): Promise<TicketResult> {
  await requirePlatformAdmin();
  const fieldErrors = validateTicket(input);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  const admin = createAdminClient();
  const { data: before } = await admin
    .from("change_tickets")
    .select("status, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "That ticket could not be found." };
  const { error } = await admin
    .from("change_tickets")
    .update({
      ...row(input),
      resolved_at: resolvedAtFor(
        before.status as TicketStatus,
        input.status as TicketStatus,
        before.resolved_at,
        new Date(),
      ),
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save the ticket. Please try again." };
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return { success: true, id };
}

export async function addTicketCommentAction(
  id: string,
  body: string,
): Promise<TicketResult> {
  const user = await requirePlatformAdmin();
  const text = body.trim();
  if (text.length < 1) return { error: "Write a comment first." };
  if (text.length > 4000)
    return { error: "Keep the comment under 4000 characters." };
  const { error } = await createAdminClient()
    .from("change_ticket_comments")
    .insert({
      ticket_id: id,
      author: user.email ?? "Platform team",
      body: text,
    });
  if (error) return { error: "Couldn't add the comment. Please try again." };
  revalidatePath(`${PATH}/${id}`);
  return { success: true };
}
