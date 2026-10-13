import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { endStreamsForMeetings } from "@/lib/livestream/service";

// A live call that nobody has been connected to for this long is ended.
export const IDLE_END_MINUTES = 3;

// Ends every live call that has been empty past the limit. The database does the
// same on a schedule (migration 0161); this covers a database without that job,
// and makes the answer right the moment someone looks.
export async function endIdleMeetings(organizationId?: string): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - IDLE_END_MINUTES * 60_000).toISOString();
  // A room an OBS encoder is sending into has no browser in it, but isn't empty: it is
  // left alone while the encoder is connected (for at most 12 hours, in case it never
  // said goodbye).
  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const { data: sending } = await admin.from("live_streams").select("meeting_id").eq("ingest_active", true).neq("status", "ended").gt("created_at", since);
  const sendingRooms = (sending ?? []).map((r) => r.meeting_id);
  let query = admin.from("kmeet_meetings").update({ status: "ended", ended_at: new Date().toISOString() }).eq("status", "live").lt("last_active_at", cutoff);
  if (sendingRooms.length > 0) query = query.not("id", "in", `(${sendingRooms.join(",")})`);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: ended } = await query.select("id, room_id");
  // A live stream broadcast from a room that has ended ends with it.
  await endStreamsForMeetings(ended ?? []);
}
