import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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
