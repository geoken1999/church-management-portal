import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InstagramCommentAutomation, InstagramConnection } from "@/types/database";

export async function getAiMode(organizationId: string, participantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instagram_ai_mode")
    .select("enabled")
    .eq("organization_id", organizationId)
    .eq("participant_id", participantId)
    .maybeSingle();
  return data?.enabled ?? false;
}

// A stuck "typing" flag (the webhook invocation crashed or timed out
// before reaching its finally block) would otherwise permanently disable
// the reply box — anything older than this is treated as stale and ignored
// rather than trusted, since a real generation finishes in a few seconds.
const TYPING_STALE_MS = 25_000;

export async function getAiTypingState(organizationId: string, participantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instagram_ai_mode")
    .select("is_typing, typing_started_at")
    .eq("organization_id", organizationId)
    .eq("participant_id", participantId)
    .maybeSingle();

  if (!data?.is_typing || !data.typing_started_at) return false;
  return Date.now() - new Date(data.typing_started_at).getTime() < TYPING_STALE_MS;
}

// Webhook-only (service client — no user session to scope an RLS-governed
// client to there).
export async function setAiTypingForWebhook(
  organizationId: string,
  participantId: string,
  typing: boolean,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("instagram_ai_mode")
    .update({ is_typing: typing, typing_started_at: typing ? new Date().toISOString() : null })
    .eq("organization_id", organizationId)
    .eq("participant_id", participantId);
}

export async function setAiMode(organizationId: string, participantId: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("instagram_ai_mode")
    .upsert(
      { organization_id: organizationId, participant_id: participantId, enabled },
      { onConflict: "organization_id,participant_id" },
    );
}

export async function getCommentAutomations(organizationId: string): Promise<InstagramCommentAutomation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instagram_comment_automations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createCommentAutomation(
  organizationId: string,
  createdBy: string,
  input: { mediaId: string | null; keyword: string | null; replyTemplate: string },
): Promise<{ error?: string }> {
  if (!input.replyTemplate.trim()) return { error: "Reply message can't be empty." };

  const supabase = await createClient();
  const { error } = await supabase.from("instagram_comment_automations").insert({
    organization_id: organizationId,
    media_id: input.mediaId,
    keyword: input.keyword?.trim() || null,
    reply_template: input.replyTemplate.trim(),
    created_by: createdBy,
  });
  return error ? { error: error.message } : {};
}

export async function setCommentAutomationEnabled(
  organizationId: string,
  automationId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("instagram_comment_automations")
    .update({ enabled })
    .eq("id", automationId)
    .eq("organization_id", organizationId);
}

export async function deleteCommentAutomation(organizationId: string, automationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("instagram_comment_automations").delete().eq("id", automationId).eq("organization_id", organizationId);
}

// --- Webhook-side helpers below: use the service client, since a webhook
// request carries no user session (RLS's is_org_member() would reject
// everything) but is authenticated separately by its HMAC signature
// (see /api/instagram/webhook's POST handler). ---

export async function findConnectionByMessagingId(messagingUserId: string): Promise<InstagramConnection | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("instagram_connections")
    .select("*")
    .eq("messaging_user_id", messagingUserId)
    .maybeSingle();
  return data;
}

export async function getAiModeForWebhook(organizationId: string, participantId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("instagram_ai_mode")
    .select("enabled")
    .eq("organization_id", organizationId)
    .eq("participant_id", participantId)
    .maybeSingle();
  return data?.enabled ?? false;
}

// Picks the single best-matching rule for a comment, most specific first:
// an exact post + keyword match beats a post-only match, which beats a
// keyword-only match, which beats a catch-all (no post, no keyword) rule —
// so one comment only ever fires one DM, never several.
export async function findMatchingCommentAutomation(
  organizationId: string,
  mediaId: string,
  commentText: string,
): Promise<InstagramCommentAutomation | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("instagram_comment_automations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("enabled", true);

  const rules = data ?? [];
  const normalizedComment = commentText.toLowerCase();

  function matches(rule: InstagramCommentAutomation): boolean {
    if (rule.media_id && rule.media_id !== mediaId) return false;
    if (rule.keyword && !normalizedComment.includes(rule.keyword.toLowerCase())) return false;
    return true;
  }

  function specificity(rule: InstagramCommentAutomation): number {
    return (rule.media_id ? 2 : 0) + (rule.keyword ? 1 : 0);
  }

  return rules.filter(matches).sort((a, b) => specificity(b) - specificity(a))[0] ?? null;
}

export async function hasAlreadyRepliedToComment(commentId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("instagram_comment_replies").select("id").eq("comment_id", commentId).maybeSingle();
  return !!data;
}

export async function recordCommentReply(
  organizationId: string,
  commentId: string,
  automationId: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("instagram_comment_replies")
    .insert({ organization_id: organizationId, comment_id: commentId, automation_id: automationId });
}

// getOrganizationContextForAi moved to src/lib/ai/organization-context.ts —
// it's channel-agnostic (no Instagram-specific data in it), and the
// WhatsApp AI auto-reply (src/app/api/whatsapp/webhook/[organizationId]/
// route.ts) needs the exact same org-data grounding.
