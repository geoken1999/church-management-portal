import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { endStreamsForMeetings } from "@/lib/livestream/service";
import { streamRoomIds } from "@/lib/kmeet/stream-rooms";

// A live call that nobody has been connected to for this long is ended.
export const IDLE_END_MINUTES = 3;

// How long past its limit a call may run before the server ends it (the page's own countdown ends it first).
const OVERRUN_GRACE_MS = 60_000;

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
  const { data: sending } = await admin
    .from("live_streams")
    .select("meeting_id")
    .eq("ingest_active", true)
    .neq("status", "ended")
    .gt("created_at", since);
  const sendingRooms = (sending ?? []).map((r) => r.meeting_id);
  let query = admin
    .from("kmeet_meetings")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("status", "live")
    .lt("last_active_at", cutoff);
  if (sendingRooms.length > 0)
    query = query.not("id", "in", `(${sendingRooms.join(",")})`);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: ended } = await query.select("id, room_id");

  // A call also ends when it has used the minutes it was allowed at its start (the church's minutes left for
  // the month). The call page ends it by itself too; this is for a call whose page was closed or tampered with.
  let liveQuery = admin
    .from("kmeet_meetings")
    .select("id, room_id, started_at, max_duration_minutes")
    .eq("status", "live")
    .not("max_duration_minutes", "is", null)
    .not("started_at", "is", null);
  if (organizationId)
    liveQuery = liveQuery.eq("organization_id", organizationId);
  const { data: live } = await liveQuery;
  // A live stream's room has no time limit, even if it was created with one.
  const streamRooms = await streamRoomIds((live ?? []).map((m) => m.id));
  const overrun = (live ?? []).filter(
    (m) =>
      !streamRooms.has(m.id) &&
      new Date(m.started_at as string).getTime() +
        (m.max_duration_minutes as number) * 60_000 +
        OVERRUN_GRACE_MS <
      Date.now(),
  );
  let overrunEnded: { id: string; room_id: string | null }[] = [];
  if (overrun.length > 0) {
    const { data } = await admin
      .from("kmeet_meetings")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .in(
        "id",
        overrun.map((m) => m.id),
      )
      .eq("status", "live")
      .select("id, room_id");
    overrunEnded = data ?? [];
  }

  // A live stream broadcast from a room that has ended ends with it.
  await endStreamsForMeetings([...(ended ?? []), ...overrunEnded]);
}
