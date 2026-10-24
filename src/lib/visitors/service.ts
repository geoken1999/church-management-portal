import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkAttemptLimit, recordAttempt } from "@/lib/auth/rate-limit";
import { VISITOR_FORM_RULE } from "@/lib/auth/rate-limit-rules";
import { dateKeyInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { pushToTeam } from "@/lib/push/team";
import { sendCatalogNotice } from "@/lib/whatsapp/catalog-send";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { feedbackDue, phoneKey, validateFeedback, validateVisit, type FeedbackInput, type VisitErrors, type VisitInput } from "@/lib/visitors/rules";
import type { Visitor } from "@/types/database";

export interface PublicChurch {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  country: string | null;
  logoUrl: string | null;
}

/** The church a QR code belongs to, or null when there is none (or the Visitors module is switched off for everyone). */
export async function publicChurchBySlug(slug: string): Promise<PublicChurch | null> {
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name, slug, timezone, country, logo_url").eq("slug", slug).maybeSingle();
  if (!org) return null;
  const { data: flag } = await admin.from("platform_feature_flags").select("enabled").eq("tab_key", "visitors").maybeSingle();
  if (flag && flag.enabled === false) return null;
  return { id: org.id, name: org.name, slug: org.slug, timezone: org.timezone || DEFAULT_TIMEZONE, country: org.country, logoUrl: org.logo_url };
}

export type VisitResult =
  | { ok: true; kind: "new" | "returning" | "member"; churchName: string }
  | { ok: false; error: string; fieldErrors?: VisitErrors };

/** A guest filled in the QR form. A number already on the visitors list is a return visit; one that belongs to a member is told so. */
export async function recordVisit(slug: string, input: VisitInput): Promise<VisitResult> {
  const fieldErrors = validateVisit(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Please check the highlighted details.", fieldErrors };
  const church = await publicChurchBySlug(slug);
  if (!church) return { ok: false, error: "This church's visitor page isn't available." };

  const key = phoneKey(input.phone);
  const limited = await checkAttemptLimit(VISITOR_FORM_RULE, key);
  if (limited) return { ok: false, error: limited };
  await recordAttempt(VISITOR_FORM_RULE, key);

  const admin = createAdminClient();
  const { data: isMember } = await admin.rpc("member_has_phone", { p_org: church.id, p_key: key });
  if (isMember === true) return { ok: true, kind: "member", churchName: church.name };

  const today = dateKeyInTimezone(new Date(), church.timezone);
  const { data: existing } = await admin.from("visitors").select("id, visit_count, last_visited_on").eq("organization_id", church.id).eq("phone_key", key).maybeSingle();
  if (existing) {
    if (existing.last_visited_on !== today) await admin.from("visitors").update({ last_visited_on: today, visit_count: existing.visit_count + 1 }).eq("id", existing.id);
    return { ok: true, kind: "returning", churchName: church.name };
  }

  const { error } = await admin.from("visitors").insert({
    organization_id: church.id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    phone_key: key,
    email: input.email.trim() || null,
    prayer_request: input.prayerRequest.trim() || null,
    first_visited_on: today,
    last_visited_on: today,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, kind: "returning", churchName: church.name };
    console.error("visitors insert failed:", error.message);
    return { ok: false, error: "Couldn't save your details. Please try again." };
  }

  await pushToTeam({
    organizationId: church.id,
    tab: "visitors",
    title: "New visitor",
    body: `${input.name.trim()} visited today${input.prayerRequest.trim() ? " and left a prayer request" : ""}.`,
    link: "/dashboard/visitors",
  });
  return { ok: true, kind: "new", churchName: church.name };
}

export interface FeedbackPage {
  churchName: string;
  firstName: string;
  alreadyAnswered: boolean;
}

export async function feedbackPageFor(token: string): Promise<FeedbackPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const admin = createAdminClient();
  const { data: visitor } = await admin.from("visitors").select("name, feedback_at, organization_id").eq("feedback_token", token).maybeSingle();
  if (!visitor) return null;
  const { data: org } = await admin.from("organizations").select("name").eq("id", visitor.organization_id).maybeSingle();
  return { churchName: org?.name ?? "the church", firstName: visitor.name.split(" ")[0], alreadyAnswered: Boolean(visitor.feedback_at) };
}

export async function recordFeedback(token: string, input: FeedbackInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const problem = validateFeedback(input);
  if (problem) return { ok: false, error: problem };
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: "This feedback link isn't valid." };
  const admin = createAdminClient();
  const { data: visitor } = await admin.from("visitors").select("id, name, organization_id, feedback_at").eq("feedback_token", token).maybeSingle();
  if (!visitor) return { ok: false, error: "This feedback link isn't valid." };
  if (visitor.feedback_at) return { ok: true };
  const { error } = await admin
    .from("visitors")
    .update({ rating: input.rating, feedback_text: input.text.trim() || null, wants_followup: input.wantsFollowup, feedback_at: new Date().toISOString() })
    .eq("id", visitor.id)
    .is("feedback_at", null);
  if (error) return { ok: false, error: "Couldn't save your feedback. Please try again." };
  if (input.wantsFollowup) {
    await pushToTeam({
      organizationId: visitor.organization_id,
      tab: "visitors",
      title: "A visitor would like a follow-up",
      body: `${visitor.name} left feedback and asked for someone to follow up.`,
      link: "/dashboard/visitors",
    });
  }
  return { ok: true };
}

/** The daily job: the day after a visit, WhatsApp the guest a feedback link. Returns what happened, for the cron log. */
export async function sendFeedbackRequests(now: Date = new Date()): Promise<{ checked: number; sent: number; skipped: number; failed: number }> {
  const admin = createAdminClient();
  const earliest = new Date(now.getTime() - 9 * 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await admin
    .from("visitors")
    .select("id, organization_id, name, phone, first_visited_on, feedback_token")
    .is("feedback_sent_at", null)
    .gte("first_visited_on", earliest)
    .order("first_visited_on", { ascending: true })
    .limit(500);
  const visitors = (rows ?? []) as Pick<Visitor, "id" | "organization_id" | "name" | "phone" | "first_visited_on" | "feedback_token">[];
  const orgIds = [...new Set(visitors.map((v) => v.organization_id))];
  const { data: orgs } = orgIds.length ? await admin.from("organizations").select("id, name, timezone, country").in("id", orgIds) : { data: [] };
  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  const result = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  for (const v of visitors) {
    const org = orgById.get(v.organization_id);
    if (!org) continue;
    const today = dateKeyInTimezone(now, org.timezone || DEFAULT_TIMEZONE);
    if (!feedbackDue(v.first_visited_on, today)) continue;
    result.checked += 1;
    const outcome = await sendCatalogNotice({
      organizationId: v.organization_id,
      catalogKey: "visitor_feedback",
      kind: "visitor_feedback",
      refId: v.id,
      rawPhone: v.phone,
      orgCountry: org.country,
      // The link is the template's button; only its last part (the visitor's own token) is sent.
      bodyParams: [v.name.split(" ")[0], org.name],
      buttonUrlParam: v.feedback_token,
    });
    if (outcome.status === "sent" || (outcome.status === "skipped" && outcome.reason === "Already sent.")) {
      await admin.from("visitors").update({ feedback_sent_at: new Date().toISOString(), feedback_note: null }).eq("id", v.id);
      result.sent += 1;
    } else {
      // Left unsent so tomorrow's run tries again (until the visit is too old); the church sees why.
      await admin.from("visitors").update({ feedback_note: outcome.reason.slice(0, 200) }).eq("id", v.id);
      if (outcome.status === "failed") result.failed += 1;
      else result.skipped += 1;
    }
  }
  if (result.failed > 0) await logPlatformEvent({ level: "warning", source: "visitor_feedback", message: `${result.failed} visitor feedback message(s) failed to send`, metadata: result });
  return result;
}
