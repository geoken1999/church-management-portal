import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEvents } from "@/lib/events/dal";
import type { KmeetMode } from "@/types/database";

export const getKmeetMeetings = cache(async (organizationId: string, mode: KmeetMode) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kmeet_meetings")
    .select("*, events(id, title), profiles!kmeet_meetings_created_by_fkey(first_name, last_name)")
    .eq("organization_id", organizationId)
    .eq("mode", mode)
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  return data ?? [];
});

// Candidates for the "link to an event" picker when scheduling a meeting
// — upcoming, non-cancelled events only. Shared by both K-Meet and
// K-Audio — which event a call is attached to isn't mode-specific.
export const getUpcomingEventOptions = cache(async (organizationId: string) => {
  const events = await getEvents(organizationId);
  const now = Date.now();
  return events.filter((event) => event.status !== "cancelled" && new Date(event.start_at).getTime() >= now).map((event) => ({ id: event.id, title: event.title }));
});

// Powers the Events page's "linked K-Meet meeting" badge — every meeting
// in this org that's tagged to an event, grouped by event_id so the
// Events list can look up its own without a query per event. Left
// unfiltered by mode — the badge shows either kind of call.
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

export const getKmeetMeeting = cache(async (organizationId: string, meetingId: string, mode: KmeetMode) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kmeet_meetings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", meetingId)
    .eq("mode", mode)
    .maybeSingle();

  return data;
});

// Public — no org/session check, used only by the /kmeet and /kaudio
// [meetingId] guest-join pages. Only title/status are selected (nothing
// from any other org-scoped table), same minimal-exposure shape as this
// app's other invite-link pages. Filtered by mode as defense-in-depth —
// a K-Audio link can't resolve a K-Meet row, and vice versa.
export const getPublicKmeetMeeting = cache(async (meetingId: string, mode: KmeetMode) => {
  const admin = createAdminClient();
  const { data } = await admin.from("kmeet_meetings").select("id, title, status").eq("id", meetingId).eq("mode", mode).maybeSingle();
  return data;
});
