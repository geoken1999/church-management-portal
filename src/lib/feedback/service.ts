import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPlatformAdmins } from "@/lib/platform-admin/notify";
import { FEEDBACK_LABELS, MAX_FEEDBACK_PER_DAY, type CleanFeedback, type FeedbackSource } from "./validation";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Stores one piece of feedback for a signed-in person and tells the KingdomFlow team. Who they are, which church
// and their role come from the server's own records, never from what the app or browser sent.
export async function saveFeedback(source: FeedbackSource, userId: string, feedback: CleanFeedback): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("app_feedback").select("id", { count: "exact", head: true }).eq("auth_user_id", userId).gt("created_at", dayAgo);
  if ((count ?? 0) >= MAX_FEEDBACK_PER_DAY) return { ok: false, error: "You've sent a lot of feedback today. Thank you — please try again tomorrow." };

  const { data: profile } = await admin.from("profiles").select("first_name, last_name, email, active_organization_id").eq("auth_user_id", userId).maybeSingle();
  const organizationId = profile?.active_organization_id ?? null;
  let role: string | null = null;
  let churchName = "";
  if (organizationId) {
    const [{ data: member }, { data: org }] = await Promise.all([
      admin.from("organization_members").select("role").eq("organization_id", organizationId).eq("auth_user_id", userId).maybeSingle(),
      admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    ]);
    role = member?.role ?? null;
    churchName = org?.name ?? "";
  }
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null;

  const { error } = await admin.from("app_feedback").insert({
    source,
    organization_id: organizationId,
    auth_user_id: userId,
    user_name: name,
    user_email: profile?.email ?? null,
    role,
    rating: feedback.rating,
    category: feedback.category,
    message: feedback.message,
    screen: feedback.screen || null,
    app_version: feedback.appVersion || null,
    device: feedback.device || null,
  });
  if (error) return { ok: false, error: "Couldn't send your feedback. Please try again." };

  // Only the worrying ones are emailed; the rest wait in Super Admin → Feedback.
  if (feedback.rating <= 2) {
    await notifyPlatformAdmins(
      `Low rating (${feedback.rating}/5) from ${churchName || "a user"}`,
      `<p><strong>${esc(name ?? "Someone")}</strong>${churchName ? ` at ${esc(churchName)}` : ""} gave ${feedback.rating}/5 on ${source} — ${FEEDBACK_LABELS[feedback.category]}.</p><p>${esc(feedback.message)}</p>`,
    );
  }
  return { ok: true };
}

// Whether this person has ever sent feedback; the reminder to send some stops once they have.
export async function hasGivenFeedback(userId: string): Promise<boolean> {
  const { count } = await createAdminClient().from("app_feedback").select("id", { count: "exact", head: true }).eq("auth_user_id", userId);
  return (count ?? 0) > 0;
}
