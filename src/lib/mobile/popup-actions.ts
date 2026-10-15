"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/dashboard/mobile/popups";

export interface PopupInput {
  title: string;
  message: string;
  buttonLabel: string;
  linkUrl: string;
  startsAt: string; // ISO, or "" for now
  endsAt: string; // ISO, or "" for no end
  showEveryTime: boolean;
}

export interface PopupResult {
  error?: string;
  success?: boolean;
}

async function requireAdmin() {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return null;
  return { userId: user.id, organizationId: membership.organization.id };
}

const NOT_ALLOWED: PopupResult = { error: "Only an owner or admin can manage popups." };

function clean(input: PopupInput): { error: string } | { row: Record<string, unknown> } {
  const title = input.title.trim();
  if (title.length < 2) return { error: "Give the popup a title." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };
  const message = input.message.trim();
  if (message.length > 600) return { error: "Keep the message under 600 characters." };

  const label = input.buttonLabel.trim();
  const link = input.linkUrl.trim();
  if ((label && !link) || (!label && link)) return { error: "A button needs both a label and a link." };
  if (label.length > 30) return { error: "Keep the button label under 30 characters." };
  if (link) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return { error: "Enter a full link, like https://example.com." };
    }
    if (url.protocol !== "https:") return { error: "The link must start with https://." };
  }

  const starts = input.startsAt ? new Date(input.startsAt) : new Date();
  if (Number.isNaN(starts.getTime())) return { error: "Enter a valid start time." };
  let ends: Date | null = null;
  if (input.endsAt) {
    ends = new Date(input.endsAt);
    if (Number.isNaN(ends.getTime())) return { error: "Enter a valid end time." };
    if (ends <= starts) return { error: "The end time must be after the start time." };
  }

  return {
    row: {
      title,
      message,
      button_label: label || null,
      link_url: link || null,
      starts_at: starts.toISOString(),
      ends_at: ends ? ends.toISOString() : null,
      show_every_time: input.showEveryTime,
    },
  };
}

export async function savePopupAction(id: string | null, input: PopupInput): Promise<PopupResult> {
  const actor = await requireAdmin();
  if (!actor) return NOT_ALLOWED;
  const parsed = clean(input);
  if ("error" in parsed) return { error: parsed.error };

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("app_popups").update({ ...parsed.row, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", actor.organizationId)
    : await admin.from("app_popups").insert({ ...parsed.row, organization_id: actor.organizationId, created_by: actor.userId, title: parsed.row.title as string });
  if (error) {
    console.error("app_popups save failed:", error.message);
    return { error: "Couldn't save the popup. Please try again." };
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function setPopupActiveAction(id: string, active: boolean): Promise<PopupResult> {
  const actor = await requireAdmin();
  if (!actor) return NOT_ALLOWED;
  const { error } = await createAdminClient().from("app_popups").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", actor.organizationId);
  if (error) return { error: "Couldn't update the popup. Please try again." };
  revalidatePath(PATH);
  return { success: true };
}

export async function deletePopupAction(id: string): Promise<PopupResult> {
  const actor = await requireAdmin();
  if (!actor) return NOT_ALLOWED;
  const { error } = await createAdminClient().from("app_popups").delete().eq("id", id).eq("organization_id", actor.organizationId);
  if (error) return { error: "Couldn't delete the popup. Please try again." };
  revalidatePath(PATH);
  return { success: true };
}
