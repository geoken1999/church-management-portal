import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { LiveStream } from "@/types/database";

export const getLiveStreams = cache(async (organizationId: string): Promise<LiveStream[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("live_streams").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as LiveStream[];
});

export const getLiveStream = cache(async (organizationId: string, id: string): Promise<LiveStream | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("live_streams").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  return (data as LiveStream | null) ?? null;
});

// The live stream a K-Connect room is broadcasting, if it is one.
export const getLiveStreamForMeeting = cache(async (organizationId: string, meetingId: string): Promise<{ id: string; status: LiveStream["status"] } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("live_streams").select("id, status").eq("organization_id", organizationId).eq("meeting_id", meetingId).maybeSingle();
  return data ?? null;
});
