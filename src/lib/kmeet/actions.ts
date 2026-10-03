"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createVideoSdkRoom } from "@/lib/kmeet/client";
import { generateParticipantToken } from "@/lib/kmeet/token";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { getPlanLimits } from "@/lib/plans/dal";
import { getSiteUrl } from "@/lib/site-url";

const KMEET_PATH = "/dashboard/kmeet";

export interface KmeetFormState {
  error?: string;
  meetingId?: string;
}

// A moderator (anyone with write access to the kmeet tab — same bar as
// scheduling/ending a meeting) always joins directly and can admit others/
// mute or remove anyone; everyone else is subject to the meeting's
// require_admission setting.
function participantPermissionsFor(isModerator: boolean, requireAdmission: boolean): string[] {
  if (isModerator) return ["allow_join", "allow_mod"];
  return requireAdmission ? ["ask_join"] : ["allow_join"];
}

export async function scheduleMeetingAction(_prevState: KmeetFormState, formData: FormData): Promise<KmeetFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kmeet.write) {
    return { error: "You don't have permission to schedule a meeting." };
  }
  if (!isVideoSdkConfigured()) {
    return { error: "Video calling isn't configured yet — ask your developer to set it up." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const requireAdmission = formData.get("requireAdmission") === "true";

  if (!title) return { error: "Give the meeting a title." };

  const scheduledAt = new Date(scheduledAtRaw);
  if (!scheduledAtRaw || Number.isNaN(scheduledAt.getTime())) return { error: "Choose a valid date and time." };
  if (scheduledAt.getTime() < Date.now() - 60_000) return { error: "Choose a time in the future." };

  const supabase = await createClient();
  const { data: meeting, error } = await supabase
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title,
      description: description || null,
      event_id: eventId || null,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
      require_admission: requireAdmission,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !meeting) return { error: "Couldn't schedule that meeting. Please try again." };

  // Every scheduled meeting shows up in Events with the normal event
  // feature set (calendar, reminders, registration, attendance) — either
  // by turning the event the host picked into an online/hybrid one, or,
  // if none was picked, by creating a new event for it.
  const joinUrl = `${getSiteUrl()}/dashboard/kmeet/${meeting.id}`;
  if (eventId) {
    const { data: existingEvent } = await supabase.from("events").select("venue").eq("id", eventId).maybeSingle();
    await supabase
      .from("events")
      .update({ meeting_mode: existingEvent?.venue ? "hybrid" : "online", meeting_link: joinUrl })
      .eq("id", eventId);
  } else {
    const { data: newEvent } = await supabase
      .from("events")
      .insert({
        organization_id: organizationId,
        title,
        description: description || null,
        start_at: scheduledAt.toISOString(),
        meeting_mode: "online",
        meeting_link: joinUrl,
        status: "active",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (newEvent) {
      await supabase.from("kmeet_meetings").update({ event_id: newEvent.id }).eq("id", meeting.id);
    }
  }

  revalidatePath(KMEET_PATH);
  revalidatePath("/dashboard/events");
  return { meetingId: meeting.id };
}

export async function startInstantMeetingAction(title: string, requireAdmission: boolean): Promise<KmeetFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.kmeet.write) {
    return { error: "You don't have permission to start a meeting." };
  }
  if (!isVideoSdkConfigured()) {
    return { error: "Video calling isn't configured yet — ask your developer to set it up." };
  }

  let roomId: string;
  try {
    roomId = await createVideoSdkRoom();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the meeting." };
  }

  const plan = await getPlanLimits(organizationId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kmeet_meetings")
    .insert({
      organization_id: organizationId,
      title: title.trim() || "Instant meeting",
      room_id: roomId,
      status: "live",
      require_admission: requireAdmission,
      started_at: new Date().toISOString(),
      max_duration_minutes: plan.kmeetMaxDurationMinutes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't start that meeting. Please try again." };

  revalidatePath(KMEET_PATH);
  return { meetingId: data.id };
}

export interface JoinMeetingResult {
  error?: string;
  roomId?: string;
  token?: string;
  displayName?: string;
  isModerator?: boolean;
  requireAdmission?: boolean;
  startedAt?: string;
  maxDurationMinutes?: number | null;
}

interface ResolvedRoom {
  roomId: string;
  requireAdmission: boolean;
  startedAt: string;
  maxDurationMinutes: number | null;
}

// Shared by both join actions below — resolves the meeting's VideoSDK
// room, creating one lazily (and marking the meeting "live", snapshotting
// the org's current plan duration limit) the first time anyone actually
// joins a scheduled meeting; an instant meeting already has one from the
// moment it was started.
async function resolveMeetingRoom(meetingId: string): Promise<ResolvedRoom | { error: string }> {
  const admin = createAdminClient();
  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("id, room_id, status, organization_id, require_admission, started_at, max_duration_minutes")
    .eq("id", meetingId)
    .maybeSingle();

  if (!meeting) return { error: "That meeting could not be found." };
  if (meeting.status === "ended") return { error: "This meeting has already ended." };

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
    maxDurationMinutes = plan.kmeetMaxDurationMinutes;
    await admin
      .from("kmeet_meetings")
      .update({ room_id: roomId, status: "live", started_at: startedAt, max_duration_minutes: maxDurationMinutes })
      .eq("id", meetingId);
  } else if (meeting.status === "scheduled") {
    await admin.from("kmeet_meetings").update({ status: "live" }).eq("id", meetingId);
  }

  return { roomId, requireAdmission: meeting.require_admission, startedAt: startedAt ?? new Date().toISOString(), maxDurationMinutes };
}

// Called from the call page right before mounting the VideoSDK call UI.
export async function joinMeetingAction(meetingId: string): Promise<JoinMeetingResult> {
  const user = await requireUser();
  const [membership, profile] = await Promise.all([requireOrganization(), getProfile()]);
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "read");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { data: meeting } = await admin
    .from("kmeet_meetings")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) return { error: "That meeting could not be found." };

  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved) return { error: resolved.error };

  const isModerator = membership.tabAccess.kmeet.write;
  const displayName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : (user.email ?? "Guest");
  const permissions = participantPermissionsFor(isModerator, resolved.requireAdmission);

  return {
    roomId: resolved.roomId,
    token: generateParticipantToken(resolved.roomId, permissions),
    displayName,
    isModerator,
    requireAdmission: resolved.requireAdmission,
    startedAt: resolved.startedAt,
    maxDurationMinutes: resolved.maxDurationMinutes,
  };
}

// No session required — this is what the public /kmeet/[meetingId] page
// calls after someone types in their name, so anyone with the link can
// join (not just logged-in org members). The meeting itself still has to
// exist and not have ended; there's no further access control beyond
// that, same as every other invite-link-based feature in this app
// (/join/[slug], /events/register/[token], /give/[token]). A guest is
// never a moderator — always subject to require_admission.
export async function joinMeetingAsGuestAction(meetingId: string, guestName: string): Promise<JoinMeetingResult> {
  const trimmedName = guestName.trim().slice(0, 80);
  if (!trimmedName) return { error: "Enter your name to join." };

  const resolved = await resolveMeetingRoom(meetingId);
  if ("error" in resolved) return { error: resolved.error };

  const permissions = participantPermissionsFor(false, resolved.requireAdmission);

  return {
    roomId: resolved.roomId,
    token: generateParticipantToken(resolved.roomId, permissions),
    displayName: trimmedName,
    isModerator: false,
    requireAdmission: resolved.requireAdmission,
    startedAt: resolved.startedAt,
    maxDurationMinutes: resolved.maxDurationMinutes,
  };
}

export async function toggleAdmissionModeAction(meetingId: string, requireAdmission: boolean): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "write");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase.from("kmeet_meetings").update({ require_admission: requireAdmission }).eq("organization_id", organizationId).eq("id", meetingId);
}

export async function endMeetingAction(meetingId: string): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "write");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase
    .from("kmeet_meetings")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", meetingId);

  revalidatePath(KMEET_PATH);
}

export async function cancelMeetingAction(meetingId: string): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "kmeet", "delete");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase.from("kmeet_meetings").delete().eq("organization_id", organizationId).eq("id", meetingId);

  revalidatePath(KMEET_PATH);
}
