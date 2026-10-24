"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordFeedback, recordVisit } from "@/lib/visitors/service";
import type { VisitErrors } from "@/lib/visitors/rules";

export interface VisitFormState {
  error?: string;
  fieldErrors?: VisitErrors;
  done?: "new" | "returning" | "member";
  churchName?: string;
}

// The public form behind the church's QR code. Anyone can submit; the server checks, rate-limits and saves.
export async function submitVisit(slug: string, _prev: VisitFormState, formData: FormData): Promise<VisitFormState> {
  const result = await recordVisit(slug, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    prayerRequest: String(formData.get("prayerRequest") ?? ""),
  });
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  return { done: result.kind, churchName: result.churchName };
}

export interface FeedbackFormState {
  error?: string;
  done?: boolean;
}

// The page the WhatsApp link opens. The token is the visitor's own, so no sign-in is needed.
export async function submitFeedback(token: string, _prev: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const follow = String(formData.get("followup") ?? "");
  const result = await recordFeedback(token, {
    rating: Number(formData.get("rating")),
    text: String(formData.get("text") ?? ""),
    wantsFollowup: follow === "yes" ? true : follow === "no" ? false : null,
  });
  return result.ok ? { done: true } : { error: result.error };
}

// The one thing the church can do to a visitor record: note that someone has followed up. Visitors are never
// added, edited or deleted by hand; they come from the QR form and leave when they become members.
export async function markVisitorFollowedUp(formData: FormData): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "visitors", "write");
  if (!access.ok) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const undo = String(formData.get("undo") ?? "") === "1";
  await createAdminClient()
    .from("visitors")
    .update({ followed_up_at: undo ? null : new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);
  revalidatePath("/dashboard/visitors");
}
