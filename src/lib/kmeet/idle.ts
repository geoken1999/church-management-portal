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
  let query = admin.from("kmeet_meetings").update({ status: "ended", ended_at: new Date().toISOString() }).eq("status", "live").lt("last_active_at", cutoff);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: ended } = await query.select("id, room_id");
  // A live stream broadcast from a room that has ended ends with it.
  await endStreamsForMeetings(ended ?? []);
}
