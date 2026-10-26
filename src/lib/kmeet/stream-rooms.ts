import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// A live stream is broadcast from a K-Connect room, but streaming is not metered like calls: a stream never counts
// against the church's K-Connect minutes and a stream room has no time limit. These are the rooms that belong to a
// live stream, among the meetings asked about.
export async function streamRoomIds(meetingIds: string[]): Promise<Set<string>> {
  if (meetingIds.length === 0) return new Set();
  const { data } = await createAdminClient().from("live_streams").select("meeting_id").in("meeting_id", meetingIds);
  return new Set((data ?? []).map((row) => row.meeting_id));
}
