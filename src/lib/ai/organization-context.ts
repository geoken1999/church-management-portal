import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOccurrencesInRange } from "@/lib/events/recurrence";
import { getSiteUrl } from "@/lib/site-url";
import { getAiDataAccessRules } from "@/lib/ai-rules/dal";

// Shared by every channel's AI auto-reply (Instagram DMs, WhatsApp) — gives
// the model real organization data to answer from instead of generic
// chit-chat. There's no dedicated "service times" or "about us" field
// anywhere in this schema (confirmed by exploring it): recurring events
// rows are the only real source for "what time is the Sunday service"-type
// questions, so this expands them the same way the dashboard's own
// calendar/list views do (events aren't stored per-occurrence) rather than
// returning the raw recurrence pattern for the model to misinterpret.
// Every query below selects only organization-level descriptive columns,
// with one deliberate exception: a branch's manager (branches.managed_by,
// resolved to that member's name/phone the same way BranchesManager.tsx's
// own card display does — leader_name/leader_phone are dead legacy columns
// with no UI to ever set them, confirmed empty on every branch tested)
// IS included, on request, specifically so someone can be told how to
// reach that location — that's public-facing contact info a church
// chooses to publish, not private data about a congregant. Everything else
// that identifies an individual stays excluded: who manages a ministry or
// fundraiser (ministries.managed_by, fundraisers.managed_by), and anything
// about a donor or form respondent (donations, form_responses) — none of
// those are selected here.
const EVENTS_LOOKAHEAD_DAYS = 60;
const MAX_EVENTS_IN_CONTEXT = 8;

export async function getOrganizationContextForAi(organizationId: string): Promise<string> {
  const supabase = createAdminClient();
  const siteUrl = getSiteUrl();
  const rules = await getAiDataAccessRules(organizationId);

  // Each category this organization has turned off in AI Rules is never
  // even queried, not just hidden from the assembled text below — the
  // model shouldn't have that data in memory at all, not merely be told
  // not to mention it.
  const [{ data: org }, { data: events }, { data: ministries }, { data: branches }, { data: fundraisers }, { data: forms }] =
    await Promise.all([
      supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
      rules.allowEvents
        ? supabase
            .from("events")
            .select(
              "title, description, start_at, end_at, is_recurring, recurrence_frequency, recurrence_end_date, venue, meeting_mode",
            )
            .eq("organization_id", organizationId)
            .neq("status", "cancelled")
        : Promise.resolve({ data: null }),
      rules.allowMinistries
        ? supabase.from("ministries").select("title, type, vision, mission, started_on, future_plans").eq("organization_id", organizationId)
        : Promise.resolve({ data: null }),
      rules.allowBranches
        ? supabase
            .from("branches")
            .select("name, location, member_count, country, members!branches_managed_by_fkey(first_name, last_name, phone)")
            .eq("organization_id", organizationId)
        : Promise.resolve({ data: null }),
      rules.allowFundraisers
        ? supabase
            .from("fundraisers")
            .select("id, title, description, goal_amount, start_date, end_date, share_token, payment_link_enabled, payment_mode")
            .eq("organization_id", organizationId)
            .eq("status", "active")
        : Promise.resolve({ data: null }),
      rules.allowForms
        ? supabase.from("forms").select("title, description, slug, fields").eq("organization_id", organizationId).eq("status", "published")
        : Promise.resolve({ data: null }),
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

  const branchLines = (branches ?? []).map((b) => {
    const parts = [b.name];
    if (b.location) parts.push(b.location);
    const manager = b.members;
    const managerName = manager ? `${manager.first_name} ${manager.last_name}`.trim() : null;
    const contact = [managerName, manager?.phone].filter(Boolean).join(", ");
    const line = parts.join(" — ");
    return contact ? `- ${line} (Contact: ${contact})` : `- ${line}`;
  });
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

  const sections = [`Organization name: ${org?.name ?? "this organization"}`];
  if (rules.allowEvents) sections.push("", "Upcoming events:", eventsBlock);
  if (ministriesBlock) sections.push("", "Ministries:", ministriesBlock);
  if (branchesBlock) sections.push("", "Locations/branches:", branchesBlock);
  if (fundraisersBlock) sections.push("", "Active fundraisers (share the link when relevant):", fundraisersBlock);
  if (formsBlock) sections.push("", "Public forms (share the link when relevant):", formsBlock);

  return sections.join("\n");
}
