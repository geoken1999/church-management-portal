import "server-only";

import { endStreamsForMeetings } from "@/lib/livestream/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { dashboardBasePathForMode } from "@/lib/kmeet/mode";
import { notifyCallStarted } from "@/lib/kmeet/notify";
import { minutesAvailableFor } from "@/lib/kmeet/minutes-service";
import { NO_MINUTES_MESSAGE } from "@/lib/kmeet/minutes";
import { getSiteUrl } from "@/lib/site-url";
import { zonedTimeToUtc, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import type { KmeetMode } from "@/types/database";

// The staff mobile app's K-Meet and K-Audio: schedule, start, end and delete
// meetings with the same rules as the web's server actions
// (src/lib/kmeet/actions.ts). Who may do it was checked by the route. Joining a
// call happens in the browser, from the meeting's link.

export type MeetingResult =
  { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): MeetingResult => ({ ok: false, error });

export async function scheduleMeeting(
  organizationId: string,
  userId: string,
  f: {
    mode: KmeetMode;
    title: string;
    description: string;
    scheduledAt: string;
    eventId: string;
    requireAdmission: boolean;
  },
): Promise<MeetingResult> {
  if (!isVideoSdkConfigured())
    return fail(
      "Video calling isn't configured yet — ask your developer to set it up.",
    );
  const title = f.title.trim();
  if (!title) return fail("Give the meeting a title.");

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();
  const timeZone = org?.timezone || DEFAULT_TIMEZONE;

  // The time has no timezone: it is the church's local time.
  const validLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.scheduledAt);
  const scheduledAt = validLocal
    ? zonedTimeToUtc(f.scheduledAt, timeZone)
    : new Date(Number.NaN);
  if (!validLocal || Number.isNaN(scheduledAt.getTime()))
    return fail("Choose a valid date and time.");
  if (scheduledAt.getTime() < Date.now() - 60_000)
    return fail("Choose a time in the future.");

  if (f.eventId) {
    const { data: event } = await admin
      .from("events")
      .select("id")
      .eq("id", f.eventId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!event) return fail("That event could not be found.");
  }

  const { data: meeting, error } = await admin
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title,
      description: f.description.trim() || null,
      event_id: f.eventId || null,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
      require_admission: f.requireAdmission,
      mode: f.mode,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !meeting)
    return fail("Couldn't schedule that meeting. Please try again.");

  // Every scheduled meeting also shows up in Events (calendar, reminders,
  // registration): the chosen event becomes online or hybrid, or a new event is
  // created for it.
  const joinUrl = `${getSiteUrl()}${dashboardBasePathForMode(f.mode)}/${meeting.id}`;
  if (f.eventId) {
    const { data: existing } = await admin
      .from("events")
      .select("venue")
      .eq("id", f.eventId)
      .maybeSingle();
    await admin
      .from("events")
      .update({
        meeting_mode: existing?.venue ? "hybrid" : "online",
        meeting_link: joinUrl,
      })
      .eq("id", f.eventId);
  } else {
    const { data: newEvent } = await admin
      .from("events")
      .insert({
        organization_id: organizationId,
        title,
        description: f.description.trim() || null,
        start_at: scheduledAt.toISOString(),
        meeting_mode: "online",
        meeting_link: joinUrl,
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single();
    if (newEvent)
      await admin
        .from("kmeet_meetings")
        .update({ event_id: newEvent.id })
        .eq("id", meeting.id);
  }
  return { ok: true, id: meeting.id };
}

export async function startInstantMeeting(
  organizationId: string,
  userId: string,
  mode: KmeetMode,
  title: string,
  requireAdmission: boolean,
): Promise<MeetingResult> {
  if (!isVideoSdkConfigured())
    return fail(
      "Video calling isn't configured yet — ask your developer to set it up.",
    );
  const minutesLeft = await minutesAvailableFor(organizationId, mode);
  if (minutesLeft === 0) return fail(NO_MINUTES_MESSAGE(mode));
  let roomId: string;
  try {
    roomId = await createVideoSdkRoom();
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Couldn't start the meeting.",
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title: title.trim() || "Instant meeting",
      room_id: roomId,
      status: "live",
      require_admission: requireAdmission,
      started_at: new Date().toISOString(),
      max_duration_minutes: minutesLeft,
      mode,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data)
    return fail("Couldn't start that meeting. Please try again.");
  await notifyCallStarted(data.id, userId);
  return { ok: true, id: data.id };
}

export async function endMeeting(
  organizationId: string,
  id: string,
): Promise<MeetingResult> {
  const admin = createAdminClient();
  const { data: ended, error } = await admin
    .from("kmeet_meetings")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id, room_id")
    .maybeSingle();
  if (ended) await endStreamsForMeetings([ended]);
  return error ? fail("Couldn't end that meeting.") : { ok: true };
}

export async function setAdmission(
  organizationId: string,
  id: string,
  requireAdmission: boolean,
): Promise<MeetingResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("kmeet_meetings")
    .update({ require_admission: requireAdmission })
    .eq("organization_id", organizationId)
    .eq("id", id);
  return error ? fail("Couldn't change that.") : { ok: true };
}

export async function deleteMeeting(
  organizationId: string,
  id: string,
): Promise<MeetingResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("kmeet_meetings")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  return error ? fail("Couldn't delete that meeting.") : { ok: true };
}
