import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEvents } from "@/lib/events/dal";

export const getKmeetMeetings = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kmeet_meetings")
    .select("*, events(id, title), profiles!kmeet_meetings_created_by_fkey(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  return data ?? [];
});

// Candidates for the "link to an event" picker when scheduling a meeting
// — upcoming, non-cancelled events only.
export const getUpcomingEventOptions = cache(async (organizationId: string) => {
  const events = await getEvents(organizationId);
  const now = Date.now();
  return events.filter((event) => event.status !== "cancelled" && new Date(event.start_at).getTime() >= now).map((event) => ({ id: event.id, title: event.title }));
});

// Powers the Events page's "linked K-meet meeting" badge — every meeting
// in this org that's tagged to an event, grouped by event_id so the
// Events list can look up its own without a query per event.
export const getKmeetMeetingsByEvent = cache(async (organizationId: string): Promise<Map<string, { id: string; title: string; status: string }[]>> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kmeet_meetings")
    .select("id, title, status, event_id")
    .eq("organization_id", organizationId)
    .not("event_id", "is", null);

  const byEvent = new Map<string, { id: string; title: string; status: string }[]>();
  for (const meeting of data ?? []) {
    if (!meeting.event_id) continue;
    const list = byEvent.get(meeting.event_id) ?? [];
    list.push({ id: meeting.id, title: meeting.title, status: meeting.status });
    byEvent.set(meeting.event_id, list);
  }
  return byEvent;
});

export const getKmeetMeeting = cache(async (organizationId: string, meetingId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kmeet_meetings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", meetingId)
    .maybeSingle();

  return data;
});

// Public — no org/session check, used only by the /kmeet/[meetingId]
// guest-join page. Only title/status are selected (nothing from any
// other org-scoped table), same minimal-exposure shape as this app's
// other invite-link pages (/join/[slug], /events/register/[token]).
export const getPublicKmeetMeeting = cache(async (meetingId: string) => {
  const admin = createAdminClient();
  const { data } = await admin.from("kmeet_meetings").select("id, title, status").eq("id", meetingId).maybeSingle();
  return data;
});
