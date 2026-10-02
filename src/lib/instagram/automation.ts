import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOccurrencesInRange } from "@/lib/events/recurrence";
import { getSiteUrl } from "@/lib/site-url";
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

const EVENTS_LOOKAHEAD_DAYS = 60;
const MAX_EVENTS_IN_CONTEXT = 8;

// Gives the AI auto-reply real organization data to answer from instead of
// generic chit-chat — the actual ask that prompted this. There's no
// dedicated "service times" or "about us" field anywhere in this schema
// (confirmed by exploring it): recurring events rows are the only real
// source for "what time is the Sunday service"-type questions, so this
// expands them the same way the dashboard's own calendar/list views do
// (events aren't stored per-occurrence) rather than returning the raw
// recurrence pattern for the model to misinterpret.
// Every query below selects only organization-level descriptive columns —
// never a column that names, contact-details, or otherwise identifies an
// individual person (a leader's name/phone, who manages something, a
// donor's name, a form response). Each table's full schema has columns
// that DO carry that kind of data (ministries.managed_by,
// branches.leader_name/leader_phone/managed_by, fundraisers.managed_by,
// donations entirely); none of them are selected here, on purpose, per
// "restrict for personal details."
export async function getOrganizationContextForAi(organizationId: string): Promise<string> {
  const supabase = createAdminClient();
  const siteUrl = getSiteUrl();

  const [{ data: org }, { data: events }, { data: ministries }, { data: branches }, { data: fundraisers }, { data: forms }] =
    await Promise.all([
      supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
      supabase
        .from("events")
        .select(
          "title, description, start_at, end_at, is_recurring, recurrence_frequency, recurrence_end_date, venue, meeting_mode",
        )
        .eq("organization_id", organizationId)
        .neq("status", "cancelled"),
      supabase
        .from("ministries")
        .select("title, type, vision, mission, started_on, future_plans")
        .eq("organization_id", organizationId),
      supabase.from("branches").select("name, location, member_count, country").eq("organization_id", organizationId),
      supabase
        .from("fundraisers")
        .select("id, title, description, goal_amount, start_date, end_date, share_token, payment_link_enabled, payment_mode")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("forms")
        .select("title, description, slug, fields")
        .eq("organization_id", organizationId)
        .eq("status", "published"),
    ]);

  const now = new Date();
  const horizon = new Date(now.getTime() + EVENTS_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const occurrences = getOccurrencesInRange(events ?? [], now, horizon).slice(0, MAX_EVENTS_IN_CONTEXT);

  const eventLines = occurrences.map(({ event, date }) => {
    const when = date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const where = event.meeting_mode === "online" ? "online" : event.venue;
    const line = where ? `${event.title} — ${when}, at ${where}` : `${event.title} — ${when}`;
    return event.description ? `- ${line}: ${event.description.slice(0, 140)}` : `- ${line}`;
  });
  const eventsBlock = eventLines.length > 0 ? eventLines.join("\n") : "No upcoming events are currently listed.";

  const ministryLines = (ministries ?? []).map((m) => {
    const label = m.type ? `${m.title} (${m.type})` : m.title;
    const detail = [m.vision, m.mission].filter(Boolean).join(" ").slice(0, 160);
    return detail ? `- ${label}: ${detail}` : `- ${label}`;
  });
  const ministriesBlock = ministryLines.length > 0 ? ministryLines.join("\n") : null;

  const branchLines = (branches ?? []).map((b) => (b.location ? `- ${b.name} — ${b.location}` : `- ${b.name}`));
  const branchesBlock = branchLines.length > 0 ? branchLines.join("\n") : null;

  // goal_amount is a stored column, but how much has actually been raised
  // is computed on the fly everywhere else in this app too (there's no
  // raised_amount column) — same sum-of-donations approach used by the
  // public give page's own get_shared_fundraiser RPC.
  const activeFundraisers = (fundraisers ?? []).filter((f) => f.payment_link_enabled && f.payment_mode);
  const fundraiserLines = await Promise.all(
    activeFundraisers.map(async (f) => {
      const { data: donations } = await supabase.from("donations").select("amount").eq("fundraiser_id", f.id);
      const raised = (donations ?? []).reduce((sum, d) => sum + d.amount, 0);
      const link = `${siteUrl}/give/${f.share_token}`;
      const base = `${f.title} — ₹${raised.toLocaleString("en-IN")} raised of a ₹${f.goal_amount.toLocaleString("en-IN")} goal. Give here: ${link}`;
      return f.description ? `- ${base}\n  ${f.description.slice(0, 160)}` : `- ${base}`;
    }),
  );
  const fundraisersBlock = fundraiserLines.length > 0 ? fundraiserLines.join("\n") : null;

  const formLines = (forms ?? []).map((f) => {
    const fieldLabels = (f.fields ?? []).map((field) => field.label).join(", ");
    const link = `${siteUrl}/forms/${f.slug}`;
    const parts = [`${f.title} — ${link}`];
    if (f.description) parts.push(f.description.slice(0, 120));
    if (fieldLabels) parts.push(`Asks for: ${fieldLabels}`);
    return `- ${parts.join(". ")}`;
  });
  const formsBlock = formLines.length > 0 ? formLines.join("\n") : null;

  const sections = [
    `Organization name: ${org?.name ?? "this organization"}`,
    "",
    "Upcoming events:",
    eventsBlock,
  ];
  if (ministriesBlock) sections.push("", "Ministries:", ministriesBlock);
  if (branchesBlock) sections.push("", "Locations/branches:", branchesBlock);
  if (fundraisersBlock) sections.push("", "Active fundraisers (share the link when relevant):", fundraisersBlock);
  if (formsBlock) sections.push("", "Public forms (share the link when relevant):", formsBlock);

  return sections.join("\n");
}
