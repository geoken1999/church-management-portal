import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { endIdleMeetings } from "@/lib/kmeet/idle";
import { getPlanLimits } from "@/lib/plans/dal";
import { kaudioMaxDurationMinutes, type PlanLimits } from "@/lib/plans/config";
import type { KmeetMode } from "@/types/database";

export function maxDurationMinutesForMode(mode: KmeetMode, plan: PlanLimits): number | null {
  return mode === "audio" ? kaudioMaxDurationMinutes(plan) : plan.kmeetMaxDurationMinutes;
}

// A moderator (anyone with write access to the kmeet tab — same bar as
// scheduling/ending a meeting) always joins directly and can admit others/
// mute or remove anyone; everyone else is subject to the meeting's
// require_admission setting.
export function participantPermissionsFor(isModerator: boolean, requireAdmission: boolean): string[] {
  if (isModerator) return ["allow_join", "allow_mod"];
  return requireAdmission ? ["ask_join"] : ["allow_join"];
}

export interface ResolvedRoom {
  roomId: string;
  requireAdmission: boolean;
  startedAt: string;
  maxDurationMinutes: number | null;
  mode: KmeetMode;
}

// Shared by both join actions below — resolves the meeting's VideoSDK
// room, creating one lazily (and marking the meeting "live", snapshotting
// the org's current plan duration limit) the first time anyone actually
// joins a scheduled meeting; an instant meeting already has one from the
// moment it was started.
export async function resolveMeetingRoom(meetingId: string): Promise<ResolvedRoom | { error: string }> {
  await endIdleMeetings();
  const admin = createAdminClient();
  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("id, room_id, status, organization_id, require_admission, started_at, max_duration_minutes, mode")
    .eq("id", meetingId)
    .maybeSingle();

  if (!meeting) return { error: "That meeting could not be found." };
  if (meeting.status === "ended") return { error: "This meeting has already ended." };
  // (A call nobody was in for 3 minutes was just ended above, so it reads as ended too.)

  let roomId = meeting.room_id;
  let startedAt = meeting.started_at;
  let maxDurationMinutes = meeting.max_duration_minutes;

  if (!roomId) {
    try {
      roomId = await createVideoSdkRoom();
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't start the meeting." };
    }
    const plan = await getPlanLimits(meeting.organization_id);
    startedAt = new Date().toISOString();
    maxDurationMinutes = maxDurationMinutesForMode(meeting.mode, plan);
    await admin
      .from("kmeet_meetings")
      .update({ room_id: roomId, status: "live", started_at: startedAt, max_duration_minutes: maxDurationMinutes, last_active_at: startedAt })
      .eq("id", meetingId);
  } else if (meeting.status === "scheduled") {
    await admin.from("kmeet_meetings").update({ status: "live", last_active_at: new Date().toISOString() }).eq("id", meetingId);
  }

  return {
    roomId,
    requireAdmission: meeting.require_admission,
    startedAt: startedAt ?? new Date().toISOString(),
    maxDurationMinutes,
    mode: meeting.mode,
  };
}

// Called from the call page right before mounting the VideoSDK call UI.
